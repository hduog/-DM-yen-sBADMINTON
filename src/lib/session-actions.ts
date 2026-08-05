import { Attendance, Member, MonthlyStatement, Session, SessionCost } from "@/lib/models";
import type { SettingsDoc } from "@/lib/models/Settings";
import { sendMessage } from "@/lib/telegram";
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

export function formatVNDate(date: Date) {
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
  notify_message_id?: number;
  notify_sent_at?: Date;
  confirmation_sent_at?: Date;
  cost_reminder_sent_at?: Date;
  need_recruit?: boolean;
  recruit_count_needed?: number;
}>;

type MemberDocT = HydratedDocument<{ full_name: string }>;

type WeeklyScheduleEntryT = { weekday: number; start_time: string; end_time: string };

// Tạo (nếu chưa có) Session cho lần diễn ra kế tiếp của 1 mục weekly_schedule — idempotent qua
// findOne({date, start_time}). Được gọi từ /api/cron/attendance/[entryId] khi job cron-job.org
// tương ứng kích hoạt (xem cron-sync.ts) — thay cho ensureUpcomingSessions cũ chạy theo tick.
export async function ensureSessionForScheduleEntry(
  entry: WeeklyScheduleEntryT,
  settings: SettingsDocT
): Promise<SessionDocT> {
  const today = vnNow();
  const todayWeekday = today.getUTCDay();
  const daysUntil = (entry.weekday - todayWeekday + 7) % 7;
  const targetDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + daysUntil)
  );

  const existing = await Session.findOne({ date: targetDate, start_time: entry.start_time });
  if (existing) return existing;

  return Session.create({
    date: targetDate,
    start_time: entry.start_time,
    end_time: entry.end_time,
    min_required: settings.required_participants ?? 1,
    status: "scheduled",
  });
}

// Nếu mốc "trước giờ tập N tiếng" của lần diễn ra kế tiếp đã trôi qua ngay tại thời điểm lưu
// cấu hình (VD: thêm/sửa lịch tập sau khi mốc kích hoạt trong tuần này đã qua), gửi thông báo ngay
// tại đây thay vì đợi cron-job.org kích hoạt lần kế (tuần sau) — tránh bỏ lỡ buổi tập gần nhất.
// Idempotent qua notify_sent_at, được gọi từ /api/settings sau mỗi lần lưu (xem session-actions.ts).
export async function runAttendanceJobIfDue(entry: WeeklyScheduleEntryT, settings: SettingsDocT) {
  const session = await ensureSessionForScheduleEntry(entry, settings);
  if (session.notify_sent_at) return session;

  const startAt = combineVNDateTime(session.date, session.start_time);
  const triggerAt = new Date(startAt.getTime() - settings.reminder_hours_before * 60 * 60 * 1000);
  if (new Date() >= triggerAt) {
    await sendAttendanceNoticeForSession(session, settings);
  }
  return session;
}

// Ghép danh sách thành viên đang active với vote của họ trong 1 buổi tập — thành viên chưa vote
// không có document Attendance nên mặc định "no_response". Dùng chung cho API xem chi tiết
// điểm danh và API nhắc điểm danh.
export async function getSessionAttendanceDetail(sessionId: string) {
  const [members, attendances] = await Promise.all([
    Member.find({ status: "active", del_flag: false }).sort({ full_name: 1 }),
    Attendance.find({ session_id: sessionId }),
  ]);

  const attendanceByMember = new Map(attendances.map((a) => [a.member_id.toString(), a]));
  const list = members.map((m) => {
    const attendance = attendanceByMember.get(m._id.toString());
    return {
      member_id: m._id.toString(),
      full_name: m.full_name,
      username: m.username,
      answer: attendance?.answer ?? "no_response",
      reason: attendance?.reason as string | undefined,
    };
  });

  return {
    list,
    presentCount: list.filter((x) => x.answer === "present").length,
    absentCount: list.filter((x) => x.answer === "absent").length,
    noResponseCount: list.filter((x) => x.answer === "no_response").length,
  };
}

type AttendanceDetailT = Awaited<ReturnType<typeof getSessionAttendanceDetail>>;

// Deep link t.me/<bot_username>?startapp=session_<id> — cách duy nhất để 1 link gửi vào GROUP tự
// mở đúng Mini App kèm danh tính đã ký của người bấm (nút web_app chỉ dùng được ở private chat).
export function buildAttendDeepLink(sessionId: string, settings: SettingsDocT): string | null {
  if (!settings.bot_username) return null;
  return `https://t.me/${settings.bot_username}?startapp=session_${sessionId}`;
}

// Thay cho sendPollForSession (poll Telegram) — giờ gửi tin nhắn thường kèm nút link tới trang
// /attend/[id] để thành viên tự vào xác nhận, thay vì vote trực tiếp trong khung poll.
export async function sendAttendanceNoticeForSession(session: SessionDocT, settings: SettingsDocT) {
  if (!settings.main_group_chat_id) return;
  const deepLink = buildAttendDeepLink(session._id.toString(), settings);
  if (!deepLink) return; // Chưa cấu hình bot_username — bỏ qua, không set notify_sent_at để tự retry lần sau.

  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const text = `📋 Điểm danh buổi tập ${dateLabel}.\nCần ${session.min_required} người. Bấm nút bên dưới để xác nhận tham gia hoặc không tham gia.`;

  const res = await sendMessage(settings.main_group_chat_id, text, {
    reply_markup: { inline_keyboard: [[{ text: "Xác nhận điểm danh", url: deepLink }]] },
  });

  session.notify_message_id = (res as { message_id: number }).message_id;
  session.notify_sent_at = new Date();
  await session.save();
}

// Ghi nhận 1 lượt vote (mới hoặc cập nhật) từ trang /attend/[id], thay cho handlePollAnswer cũ
// (Telegram poll_answer webhook) — vote giờ đi qua API có session cookie thay vì webhook Telegram.
export async function recordAttendanceVote(
  session: SessionDocT,
  member: MemberDocT,
  answer: "present" | "absent",
  reason: string | undefined,
  settings: SettingsDocT
): Promise<AttendanceDetailT> {
  await Attendance.findOneAndUpdate(
    { session_id: session._id, member_id: member._id },
    answer === "absent"
      ? { $set: { answer, reason, answered_at: new Date() } }
      : { $set: { answer, answered_at: new Date() }, $unset: { reason: "" } },
    { upsert: true }
  );

  const detail = await getSessionAttendanceDetail(session._id.toString());
  await announceVoteToGroup(session, member, answer, reason, detail, settings);

  if (
    answer === "present" &&
    session.status === "scheduled" &&
    detail.presentCount >= session.min_required
  ) {
    await announceQuotaReached(session, settings, detail.presentCount);
  }

  return detail;
}

// Thông báo cập nhật vào nhóm sau MỌI lượt vote (cả tham gia lẫn không tham gia) — mời các thành
// viên còn "no_response" bấm lại đúng link để bình chọn.
async function announceVoteToGroup(
  session: SessionDocT,
  member: MemberDocT,
  answer: "present" | "absent",
  reason: string | undefined,
  detail: AttendanceDetailT,
  settings: SettingsDocT
) {
  if (!settings.main_group_chat_id) return;

  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const otherPresentNames = detail.list
    .filter((m) => m.answer === "present" && m.member_id !== member._id.toString())
    .map((m) => m.full_name);
  const noResponseNames = detail.list.filter((m) => m.answer === "no_response").map((m) => m.full_name);

  const lines: string[] = [];
  if (answer === "present") {
    lines.push(`✅ <b>${member.full_name}</b> đã xác nhận <b>tham gia</b> buổi tập ${dateLabel}.`);
    if (otherPresentNames.length > 0) lines.push(`Cùng với: ${otherPresentNames.join(", ")}.`);
  } else {
    lines.push(`❌ <b>${member.full_name}</b> đã xác nhận <b>không tham gia</b> buổi tập ${dateLabel}.`);
    lines.push(`Lý do: ${reason}`);
  }
  lines.push(`Đã có <b>${detail.presentCount}/${session.min_required}</b> người tham gia.`);
  if (noResponseNames.length > 0) lines.push(`Mời ${noResponseNames.join(", ")} vào bình chọn.`);

  const deepLink = buildAttendDeepLink(session._id.toString(), settings);
  await sendMessage(settings.main_group_chat_id, lines.join("\n"), {
    reply_markup: deepLink ? { inline_keyboard: [[{ text: "Điểm danh ngay", url: deepLink }]] } : undefined,
  });
}

// Chốt đủ người ngay khi vote "Có" vừa chạm mốc min_required, thay vì đợi mốc T-5h
// (reconcileDueAttendance chỉ còn lo nhánh thiếu người).
async function announceQuotaReached(session: SessionDocT, settings: SettingsDocT, presentCount: number) {
  session.status = "confirmed_enough";
  session.confirmation_sent_at = new Date();
  await session.save();

  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const text = `✅ Buổi tập ${dateLabel} đã đủ người (${presentCount}/${session.min_required}).`;
  if (settings.main_group_chat_id) await sendMessage(settings.main_group_chat_id, text);
  if (settings.admin_group_chat_id) await sendMessage(settings.admin_group_chat_id, text);
}

const CONFIRM_HOURS_BEFORE = 5;

// Chốt "thiếu người" ở mốc T-5h trước giờ tập cho các buổi vẫn còn "scheduled" (chưa đủ vote
// "tham gia" — nếu đủ rồi thì recordAttendanceVote đã chốt confirmed_enough ngay lúc vote, xem
// announceQuotaReached). Không còn xử lý nhánh "enough" ở đây nữa.
export async function reconcileDueAttendance(settings: SettingsDocT) {
  const now = new Date();
  const sessions = await Session.find({
    status: "scheduled",
    notify_sent_at: { $exists: true },
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

    session.status = "confirmed_shortage";
    session.confirmation_sent_at = now;
    session.need_recruit = true;
    session.recruit_count_needed = Math.max(session.min_required - presentCount, 0);
    await session.save();

    if (settings.admin_group_chat_id) {
      const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
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

export function shiftMonth(monthStr: string, delta: number) {
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
    const sessionTotal = costs.reduce((sum, c) => sum + c.total_amount, 0) + (settings.fixed_cost_per_session ?? 0);
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
