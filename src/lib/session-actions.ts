import { Attendance, Member, MonthlyStatement, Session, SessionCost } from "@/lib/models";
import type { SettingsDoc } from "@/lib/models/Settings";
import { sendMessage, sendPoll } from "@/lib/telegram";
import type { HydratedDocument } from "mongoose";

type SettingsDocT = HydratedDocument<SettingsDoc>;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// "Đồng hồ VN": các getUTC* trên Date trả về đúng giờ/ngày địa phương VN (UTC+7, không có DST).
export function vnNow(): Date {
  return new Date(Date.now() + VN_OFFSET_MS);
}

// Ghép ngày (lưu dạng UTC midnight của ngày VN) + giờ "HH:mm" (giờ VN) thành mốc thời gian UTC thật.
export function combineVNDateTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  return new Date(Date.UTC(y, mo, d, h, m) - VN_OFFSET_MS);
}

function formatVNDate(date: Date) {
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

type SessionDocT = HydratedDocument<{
  date: Date;
  start_time: string;
  end_time: string;
  min_required: number;
  status: string;
  poll_message_id?: number;
  poll_id?: string;
  poll_sent_at?: Date;
  confirmation_sent_at?: Date;
  cost_reminder_sent_at?: Date;
  need_recruit?: boolean;
  recruit_count_needed?: number;
}>;

// Tự tạo Session cho các buổi trong 7 ngày tới dựa theo settings.weekly_schedule — idempotent.
export async function ensureUpcomingSessions(settings: SettingsDocT) {
  if (!settings.weekly_schedule?.length) return;

  const today = vnNow();
  const todayWeekday = today.getUTCDay();

  for (const entry of settings.weekly_schedule) {
    const daysUntil = (entry.weekday - todayWeekday + 7) % 7;
    const targetDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + daysUntil)
    );

    const exists = await Session.findOne({
      date: targetDate,
      start_time: entry.start_time,
    });
    if (exists) continue;

    await Session.create({
      date: targetDate,
      start_time: entry.start_time,
      end_time: entry.end_time,
      min_required: 1,
      status: "scheduled",
    });
  }
}

export async function sendPollForSession(session: SessionDocT, settings: SettingsDocT) {
  if (!settings.main_group_chat_id) return;

  const question = `Bạn có tham gia buổi tập ${formatVNDate(session.date)} (${session.start_time}-${session.end_time}) không?`;
  const poll = await sendPoll(settings.main_group_chat_id, question, ["Có", "Không"]);

  session.poll_message_id = poll.message_id;
  session.poll_id = poll.poll.id;
  session.poll_sent_at = new Date();
  await session.save();
}

// Gửi poll cho các buổi đã tới mốc "trước giờ tập N tiếng" (settings.reminder_hours_before) mà chưa gửi.
export async function sendDuePolls(settings: SettingsDocT) {
  const now = new Date();
  const sessions = await Session.find({
    status: "scheduled",
    poll_sent_at: { $exists: false },
  });

  for (const session of sessions) {
    const startAt = combineVNDateTime(session.date, session.start_time);
    const dueAt = new Date(startAt.getTime() - settings.reminder_hours_before * 60 * 60 * 1000);
    if (now >= dueAt) {
      await sendPollForSession(session, settings);
    }
  }
}

const CONFIRM_HOURS_BEFORE = 5;

// Chốt đủ/thiếu người ở mốc T-5h trước giờ tập — xem mục 5.1 bước 4.
export async function reconcileDueAttendance(settings: SettingsDocT) {
  const now = new Date();
  const sessions = await Session.find({
    status: "scheduled",
    poll_sent_at: { $exists: true },
    confirmation_sent_at: { $exists: false },
  });

  for (const session of sessions) {
    const startAt = combineVNDateTime(session.date, session.start_time);
    const dueAt = new Date(startAt.getTime() - CONFIRM_HOURS_BEFORE * 60 * 60 * 1000);
    if (now < dueAt) continue;

    const presentCount = await Attendance.countDocuments({
      session_id: session._id,
      answer: "present",
    });
    const enough = presentCount >= session.min_required;

    session.status = enough ? "confirmed_enough" : "confirmed_shortage";
    session.confirmation_sent_at = now;
    if (!enough) {
      session.need_recruit = true;
      session.recruit_count_needed = Math.max(session.min_required - presentCount, 0);
    }
    await session.save();

    const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
    if (enough) {
      const text = `✅ Buổi tập ${dateLabel} đã đủ người (${presentCount}/${session.min_required}).`;
      if (settings.main_group_chat_id) await sendMessage(settings.main_group_chat_id, text);
      if (settings.admin_group_chat_id) await sendMessage(settings.admin_group_chat_id, text);
    } else if (settings.admin_group_chat_id) {
      await sendMessage(
        settings.admin_group_chat_id,
        `⚠️ Buổi tập ${dateLabel} đang thiếu người (${presentCount}/${session.min_required}, cần tuyển thêm ${session.recruit_count_needed}). Vào Mini App để tạo bài tuyển vãng lai.`
      );
    }
  }
}

// Nhắc admin nhập vật phẩm sau khi buổi tập kết thúc — xem mục 5.2 bước 1.
export async function sendDueCostReminders(settings: SettingsDocT) {
  const now = new Date();
  const sessions = await Session.find({
    status: { $in: ["confirmed_enough", "confirmed_shortage"] },
    cost_reminder_sent_at: { $exists: false },
  });

  for (const session of sessions) {
    const endAt = combineVNDateTime(session.date, session.end_time);
    const dueAt = new Date(endAt.getTime() + settings.cost_survey_minutes_after * 60 * 1000);
    if (now < dueAt) continue;

    if (settings.admin_group_chat_id) {
      await sendMessage(
        settings.admin_group_chat_id,
        `🧾 Buổi tập ${formatVNDate(session.date)} đã kết thúc. Vào Mini App nhập số lượng vật phẩm đã dùng để tính chi phí.`
      );
    }
    session.cost_reminder_sent_at = now;
    await session.save();
  }
}

function shiftMonth(monthStr: string, delta: number) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Tổng hợp sao kê tháng trước vào đúng ngày settings.monthly_settlement_day — xem mục 5.3.
export async function runDueMonthlySettlement(settings: SettingsDocT) {
  const today = vnNow();
  if (today.getUTCDate() !== settings.monthly_settlement_day) return;

  const currentMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const targetMonth = shiftMonth(currentMonth, -1);

  if (settings.last_monthly_settlement_run === targetMonth) return;

  const [ty, tm] = targetMonth.split("-").map(Number);
  const monthStart = new Date(Date.UTC(ty, tm - 1, 1));
  const monthEnd = new Date(Date.UTC(ty, tm, 1));

  const sessions = await Session.find({
    date: { $gte: monthStart, $lt: monthEnd },
    status: { $in: ["confirmed_enough", "confirmed_shortage"] },
  });

  const memberTotals = new Map<string, { amount: number; sessionCount: number }>();

  for (const session of sessions) {
    const costs = await SessionCost.find({ session_id: session._id });
    const sessionTotal = costs.reduce((sum, c) => sum + c.total_amount, 0);
    if (sessionTotal === 0) continue;

    const presentAttendances = await Attendance.find({
      session_id: session._id,
      answer: "present",
    });
    if (presentAttendances.length === 0) continue;

    const perPerson = sessionTotal / presentAttendances.length;
    for (const att of presentAttendances) {
      const key = att.member_id.toString();
      const current = memberTotals.get(key) ?? { amount: 0, sessionCount: 0 };
      current.amount += perPerson;
      current.sessionCount += 1;
      memberTotals.set(key, current);
    }
  }

  let totalClub = 0;
  for (const [memberId, totals] of memberTotals) {
    const member = await Member.findById(memberId);
    if (!member) continue;

    const statement = await MonthlyStatement.findOneAndUpdate(
      { member_id: memberId, month: targetMonth },
      {
        member_id: memberId,
        month: targetMonth,
        total_sessions: totals.sessionCount,
        total_amount: Math.round(totals.amount),
        status: "pending",
      },
      { upsert: true, new: true }
    );

    totalClub += statement.total_amount;

    if (member.statement_chat_id) {
      await sendMessage(
        member.statement_chat_id,
        `📄 <b>Sao kê tháng ${targetMonth}</b>\nSố buổi tham gia: ${totals.sessionCount}\nTổng tiền cần đóng: <b>${statement.total_amount.toLocaleString("vi-VN")}đ</b>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Tôi đã thanh toán", callback_data: `paid:${statement._id}` }],
            ],
          },
        }
      );
    }
  }

  if (settings.admin_group_chat_id && memberTotals.size > 0) {
    await sendMessage(
      settings.admin_group_chat_id,
      `📊 Đã chốt sao kê tháng ${targetMonth}: ${memberTotals.size} thành viên, tổng ${totalClub.toLocaleString("vi-VN")}đ.`
    );
  }

  settings.last_monthly_settlement_run = targetMonth;
  await settings.save();
}
