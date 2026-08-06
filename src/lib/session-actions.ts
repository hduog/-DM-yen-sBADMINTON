import {
  Attendance,
  Member,
  MemberAdvance,
  MonthlyStatement,
  Session,
  SessionCost,
  SessionGuest,
  SessionMemberCost,
} from "@/lib/models";
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
  start_notice_sent_at?: Date;
  cost_reminder_sent_at?: Date;
  cost_settled_at?: Date;
  pass_court_at?: Date;
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
    Member.find({ status: "active", del_flag: { $ne: true } }).sort({ full_name: 1 }),
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

// Deep link tới trang quyết toán /settle/[id] (chỉ admin xem được — xem AttendLayout tương ứng),
// dùng trong tin nhắn nhắc quyết toán gửi vào nhóm quản trị (xem sendDueSettlementReminders).
export function buildSettleDeepLink(sessionId: string, settings: SettingsDocT): string | null {
  if (!settings.bot_username) return null;
  return `https://t.me/${settings.bot_username}?startapp=settle_${sessionId}`;
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
): Promise<AttendanceDetailT & { totalUnits: number }> {
  await Attendance.findOneAndUpdate(
    { session_id: session._id, member_id: member._id },
    answer === "absent"
      ? { $set: { answer, reason, answered_at: new Date() } }
      : { $set: { answer, answered_at: new Date() }, $unset: { reason: "" } },
    { upsert: true }
  );

  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const { detail, costUnits } = await announceAttendanceChange(session, settings, (detail) => {
    if (answer === "present") {
      const otherPresentNames = detail.list
        .filter((m) => m.answer === "present" && m.member_id !== member._id.toString())
        .map((m) => m.full_name);
      return [
        `✅ <b>${member.full_name}</b> đã xác nhận <b>tham gia</b> buổi tập ${dateLabel}.`,
        ...(otherPresentNames.length > 0 ? [`Cùng với: ${otherPresentNames.join(", ")}.`] : []),
      ];
    }
    return [
      `❌ <b>${member.full_name}</b> đã xác nhận <b>không tham gia</b> buổi tập ${dateLabel}.`,
      `Lý do: ${reason}`,
    ];
  });

  return { ...detail, totalUnits: costUnits.totalUnits };
}

// Thông báo cập nhật vào nhóm dùng chung cho MỌI thay đổi ảnh hưởng số lượng tham gia — vote của
// thành viên (recordAttendanceVote) lẫn thêm/xoá khách vãng lai (/api/sessions/[id]/guests). Số
// lượng hiển thị ("Đã có X/Y") LUÔN tính cả khách vãng lai (getSessionCostUnits), không chỉ member
// điểm danh "Có" — vì khách vãng lai cũng là người thật tham gia buổi tập. Tự chốt "đủ người" nếu
// mốc này vừa đạt min_required trong khi session còn "scheduled".
export async function announceAttendanceChange(
  session: SessionDocT,
  settings: SettingsDocT,
  buildHeadline: (detail: AttendanceDetailT) => string[]
): Promise<{ detail: AttendanceDetailT; costUnits: Awaited<ReturnType<typeof getSessionCostUnits>> }> {
  const [detail, costUnits] = await Promise.all([
    getSessionAttendanceDetail(session._id.toString()),
    getSessionCostUnits(session._id.toString()),
  ]);

  if (settings.main_group_chat_id) {
    const noResponseNames = detail.list.filter((m) => m.answer === "no_response").map((m) => m.full_name);
    const footer = [`Đã có <b>${costUnits.totalUnits}/${session.min_required}</b> người tham gia.`];
    if (noResponseNames.length > 0) footer.push(`Mời ${noResponseNames.join(", ")} vào bình chọn.`);

    const deepLink = buildAttendDeepLink(session._id.toString(), settings);
    await sendMessage(settings.main_group_chat_id, [...buildHeadline(detail), ...footer].join("\n"), {
      reply_markup: deepLink ? { inline_keyboard: [[{ text: "Điểm danh ngay", url: deepLink }]] } : undefined,
    });
  }

  if (session.status === "scheduled" && costUnits.totalUnits >= session.min_required) {
    await announceQuotaReached(session, settings, costUnits.totalUnits);
  }

  return { detail, costUnits };
}

// Chốt đủ người ngay khi số lượng tham gia (thành viên + khách vãng lai) vừa chạm mốc
// min_required, thay vì đợi mốc T-5h (reconcileDueAttendance chỉ còn lo nhánh thiếu người).
async function announceQuotaReached(session: SessionDocT, settings: SettingsDocT, headcount: number) {
  session.status = "confirmed_enough";
  session.confirmation_sent_at = new Date();
  await session.save();

  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const text = `✅ Buổi tập ${dateLabel} đã đủ người (${headcount}/${session.min_required}).`;
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

    const { totalUnits: headcount } = await getSessionCostUnits(session._id.toString());

    session.status = "confirmed_shortage";
    session.confirmation_sent_at = now;
    session.need_recruit = true;
    session.recruit_count_needed = Math.max(session.min_required - headcount, 0);
    await session.save();

    if (settings.admin_group_chat_id) {
      const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
      await sendMessage(
        settings.admin_group_chat_id,
        `⚠️ Buổi tập ${dateLabel} đang thiếu người (${headcount}/${session.min_required}, cần tuyển thêm ${session.recruit_count_needed}). Vào Mini App để tạo bài tuyển vãng lai.`
      );
    }
  }
}

// Tìm session tương ứng 1 mục weekly_schedule mà KHÔNG tạo mới — dùng bởi job "đang diễn ra"/
// "nhắc quyết toán" (chạy TẠI/SAU giờ tập nên không dùng ensureSessionForScheduleEntry: hàm đó suy
// ra "lần diễn ra kế tiếp" từ thứ trong tuần HIỆN TẠI, sẽ tính sai nếu job bắn sau nửa đêm giờ VN
// (VD buổi tập tối muộn) trong khi buổi tập thực ra thuộc ngày hôm trước. Xét cả hôm nay lẫn hôm
// qua theo giờ VN để bắt đúng cả 2 trường hợp.
export async function findSessionForScheduleEntry(entry: WeeklyScheduleEntryT): Promise<SessionDocT | null> {
  const now = vnNow();
  const candidateDates: Date[] = [];
  for (let back = 0; back <= 1; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
    if (d.getUTCDay() === entry.weekday) candidateDates.push(d);
  }
  if (candidateDates.length === 0) return null;
  return Session.findOne({ date: { $in: candidateDates }, start_time: entry.start_time }).sort({ date: -1 });
}

// Gửi thông báo "buổi tập đang diễn ra" vào nhóm chính — được job cron-job.org riêng của mục lịch
// gọi đúng giờ bắt đầu (xem /api/cron/session-start/[entryId], cron-sync.ts). Bỏ qua (chỉ đánh dấu
// đã xử lý, không gửi gì) nếu buổi đã huỷ hoặc đã pass sân. Idempotent qua start_notice_sent_at.
export async function sendSessionStartingNotice(session: SessionDocT, settings: SettingsDocT) {
  if (session.start_notice_sent_at) return;

  if (session.status !== "cancelled" && !session.pass_court_at && settings.main_group_chat_id) {
    const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
    await sendMessage(
      settings.main_group_chat_id,
      `🏸 Buổi tập ${dateLabel} đang diễn ra! Mọi người nhanh chóng tham gia nhé.`
    );
  }
  session.start_notice_sent_at = new Date();
  await session.save();
}

// Chạy bù cho job "đang diễn ra" nếu mốc giờ bắt đầu của lần diễn ra hiện tại đã trôi qua ngay tại
// thời điểm lưu cấu hình (VD: sửa lịch tập sau khi mốc này trong tuần đã qua) — cùng cơ chế với
// runAttendanceJobIfDue.
export async function runSessionStartJobIfDue(entry: WeeklyScheduleEntryT, settings: SettingsDocT) {
  const session = await findSessionForScheduleEntry(entry);
  if (!session || session.start_notice_sent_at) return;
  const startAt = combineVNDateTime(session.date, session.start_time);
  if (new Date() >= startAt) await sendSessionStartingNotice(session, settings);
}

// Gửi nhắc quyết toán (kèm link /settle/[id]) vào nhóm quản trị — được job cron-job.org riêng của
// mục lịch gọi ở mốc "sau giờ kết thúc N phút" (settings.cost_survey_minutes_after; xem
// /api/cron/settlement-reminder/[entryId], cron-sync.ts). Bỏ qua nếu buổi đã huỷ hoặc đã pass sân —
// 2 trường hợp không có gì để quyết toán qua trang này. Idempotent qua cost_reminder_sent_at.
export async function sendSettlementReminder(session: SessionDocT, settings: SettingsDocT) {
  if (session.cost_reminder_sent_at) return;

  if (session.status !== "cancelled" && !session.pass_court_at && settings.admin_group_chat_id) {
    const deepLink = buildSettleDeepLink(session._id.toString(), settings);
    const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
    await sendMessage(
      settings.admin_group_chat_id,
      `🧮 Buổi tập ${dateLabel} đã kết thúc. Vào quyết toán chi phí: nhập vật phẩm, xem chia tiền và xác nhận.`,
      deepLink
        ? { reply_markup: { inline_keyboard: [[{ text: "Quyết toán buổi tập", url: deepLink }]] } }
        : undefined
    );
  }
  session.cost_reminder_sent_at = new Date();
  await session.save();
}

// Chạy bù cho job nhắc quyết toán nếu mốc "sau giờ kết thúc N phút" đã trôi qua ngay tại thời điểm
// lưu cấu hình — cùng cơ chế với runAttendanceJobIfDue.
export async function runSettlementReminderJobIfDue(entry: WeeklyScheduleEntryT, settings: SettingsDocT) {
  const session = await findSessionForScheduleEntry(entry);
  if (!session || session.cost_reminder_sent_at) return;
  const endAt = combineVNDateTime(session.date, session.end_time);
  const dueAt = new Date(endAt.getTime() + settings.cost_survey_minutes_after * 60 * 1000);
  if (new Date() >= dueAt) await sendSettlementReminder(session, settings);
}

// Điều kiện được phép tự thêm/sửa/xoá khách vãng lai từ trang /attend/[id] — cùng điều kiện khoá
// với API admin (/api/sessions/[id]/guests: huỷ/đã quyết toán/pass-sân) cộng thêm mốc hết giờ điểm
// danh (giống vote ở /api/attend/[id]) để member không thể sửa sau khi buổi đã bắt đầu.
export function assertGuestEditable(session: SessionDocT): string | null {
  if (session.status === "cancelled") return "Buổi tập đã huỷ, không thể chỉnh sửa";
  if (session.cost_settled_at || session.pass_court_at) return "Buổi tập đã quyết toán, không thể chỉnh sửa";
  if (new Date() >= combineVNDateTime(session.date, session.start_time)) {
    return "Đã quá giờ, buổi tập đã bắt đầu nên không thể chỉnh sửa";
  }
  return null;
}

// Danh sách khách vãng lai do 1 member tự đăng ký (responsible_member_id = chính họ) trong 1 buổi
// tập — dùng để hiển thị/trả về sau mỗi lần thêm/sửa/xoá ở trang /attend/[id].
export async function getMemberGuests(sessionId: string, memberId: string) {
  return SessionGuest.find({ session_id: sessionId, responsible_member_id: memberId }).sort({ createdAt: 1 });
}

// Tính "suất" chi phí mỗi thành viên gánh trong 1 buổi tập: mỗi member có mặt = 1 suất, cộng
// thêm số lượng khách vãng lai vào đúng người chịu trách nhiệm (dù người đó có mặt hay không —
// xem SessionGuest.ts). Dùng chung cho preview real-time (/api/sessions/[id]/costs) và chốt sao
// kê tháng thật (runDueMonthlySettlement) để tránh lệch logic giữa 2 nơi.
export async function getSessionCostUnits(sessionId: string) {
  const [presentAttendances, guests] = await Promise.all([
    Attendance.find({ session_id: sessionId, answer: "present" }),
    SessionGuest.find({ session_id: sessionId }),
  ]);

  const unitsByMember = new Map<string, number>();
  for (const att of presentAttendances) {
    const key = att.member_id.toString();
    unitsByMember.set(key, (unitsByMember.get(key) ?? 0) + 1);
  }
  for (const guest of guests) {
    const key = guest.responsible_member_id.toString();
    unitsByMember.set(key, (unitsByMember.get(key) ?? 0) + guest.quantity);
  }

  let totalUnits = 0;
  for (const units of unitsByMember.values()) totalUnits += units;

  return { totalUnits, unitsByMember };
}

// Phân bổ chi phí 1 buổi tập vào MonthlyStatement — dùng chung cho nút "Quyết toán", tự động khi
// huỷ buổi, và cron dọn nốt buổi bị bỏ sót cuối tháng (runDueMonthlySettlement). Idempotent qua
// cost_settled_at: gọi lại trên buổi đã settle sẽ no-op (trả về null) để tránh cộng dồn 2 lần.
export async function settleSessionCost(session: SessionDocT, settings: SettingsDocT) {
  if (session.cost_settled_at) return null;

  let total: number;
  let unitsByMember: Map<string, number>;

  if (session.status === "cancelled") {
    // Buổi huỷ: không ai điểm danh được, chỉ tính chi phí cố định (VD tiền sân đã cọc không hoàn),
    // chia đều cho TẤT CẢ thành viên active thay vì theo suất có mặt.
    total = settings.fixed_cost_per_session ?? 0;
    const activeMembers = await Member.find({ status: "active", del_flag: { $ne: true } });
    unitsByMember = new Map(activeMembers.map((m) => [m._id.toString(), 1]));
  } else {
    const costs = await SessionCost.find({ session_id: session._id });
    total = costs.reduce((sum, c) => sum + c.total_amount, 0) + (settings.fixed_cost_per_session ?? 0);
    ({ unitsByMember } = await getSessionCostUnits(session._id.toString()));
  }

  let totalUnits = 0;
  for (const units of unitsByMember.values()) totalUnits += units;

  const month = `${session.date.getUTCFullYear()}-${String(session.date.getUTCMonth() + 1).padStart(2, "0")}`;
  const shares = new Map<string, number>();

  if (total > 0 && totalUnits > 0) {
    const perUnit = total / totalUnits;
    for (const [memberId, units] of unitsByMember) {
      const amount = Math.round(perUnit * units);
      if (amount <= 0) continue;
      shares.set(memberId, amount);

      await SessionMemberCost.findOneAndUpdate(
        { session_id: session._id, member_id: memberId },
        { session_id: session._id, member_id: memberId, amount, units },
        { upsert: true }
      );

      // Không đụng vào sao kê đã báo đóng/đã duyệt — tránh sửa ngược 1 khoản đã xử lý xong.
      const existingStatement = await MonthlyStatement.findOne({ member_id: memberId, month });
      if (existingStatement && existingStatement.status !== "pending") continue;
      await MonthlyStatement.findOneAndUpdate(
        { member_id: memberId, month },
        { $inc: { total_amount: amount, total_sessions: 1 }, $setOnInsert: { status: "pending" } },
        { upsert: true }
      );
    }
  }

  session.cost_settled_at = new Date();
  await session.save();

  return { total, totalUnits, shares, month };
}

// Gửi thông báo chi tiết ngay sau khi quyết toán (nút "Quyết toán" trong màn quản lý điểm danh):
// (1) vào nhóm quản lý — chi phí cố định, vật phẩm/số lượng, ai tham gia, số tiền mỗi người;
// (2) vào group riêng (statement_chat_id) của từng thành viên có suất phải trả — số tiền họ cần
// thanh toán cho buổi tập hôm nay. Dùng chung shares/total đã tính sẵn từ settleSessionCost để
// khỏi tính lại, tránh lệch số giữa 2 nơi.
export async function sendSettlementNotifications(
  session: SessionDocT,
  settings: SettingsDocT,
  result: { total: number; totalUnits: number; shares: Map<string, number>; month: string }
) {
  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;

  const [costs, guests, detail, members] = await Promise.all([
    SessionCost.find({ session_id: session._id }).populate<{ item_id: { name: string; unit: string } | null }>(
      "item_id",
      "name unit"
    ),
    SessionGuest.find({ session_id: session._id }).populate<{
      responsible_member_id: { full_name: string } | null;
    }>("responsible_member_id", "full_name"),
    getSessionAttendanceDetail(session._id.toString()),
    Member.find({ _id: { $in: [...result.shares.keys()] } }),
  ]);

  const memberById = new Map(members.map((m) => [m._id.toString(), m]));
  const presentNames = detail.list.filter((m) => m.answer === "present").map((m) => m.full_name);

  if (settings.admin_group_chat_id) {
    const lines = [`🧮 <b>Đã quyết toán buổi tập ${dateLabel}</b>`, ""];

    const fixedCost = settings.fixed_cost_per_session ?? 0;
    if (session.status === "cancelled") {
      lines.push(`Buổi huỷ — chỉ tính chi phí cố định: ${fixedCost.toLocaleString("vi-VN")}đ`);
    } else {
      if (fixedCost > 0) lines.push(`Chi phí cố định: ${fixedCost.toLocaleString("vi-VN")}đ`);
      for (const c of costs) {
        if (!c.item_id) continue;
        lines.push(`${c.item_id.name}: ${c.quantity} ${c.item_id.unit} = ${c.total_amount.toLocaleString("vi-VN")}đ`);
      }
      lines.push(
        `Người tham gia (${presentNames.length}): ${presentNames.length > 0 ? presentNames.join(", ") : "(không ai)"}`
      );
      if (guests.length > 0) {
        const guestLabel = guests
          .map((g) => `${g.guest_name || "khách"} x${g.quantity} (${g.responsible_member_id?.full_name ?? "?"})`)
          .join(", ");
        lines.push(`Khách vãng lai: ${guestLabel}`);
      }
    }

    lines.push("", `Tổng chi phí: <b>${result.total.toLocaleString("vi-VN")}đ</b> (${result.totalUnits} suất)`, "");
    lines.push("Số tiền mỗi người:");
    for (const [memberId, amount] of result.shares) {
      lines.push(`- ${memberById.get(memberId)?.full_name ?? "(?)"}: ${amount.toLocaleString("vi-VN")}đ`);
    }
    lines.push("", `Đã cộng vào sao kê tháng ${result.month}.`);

    await sendMessage(settings.admin_group_chat_id, lines.join("\n"));
  }

  for (const [memberId, amount] of result.shares) {
    const member = memberById.get(memberId);
    if (!member?.statement_chat_id) continue;
    await sendMessage(
      member.statement_chat_id,
      `💵 Buổi tập ${dateLabel}\nSố tiền bạn cần thanh toán hôm nay: <b>${amount.toLocaleString("vi-VN")}đ</b>\n(Đã cộng vào sao kê tháng ${result.month})`
    );
  }
}

// Xoá sạch kết quả quyết toán/huỷ/pass-sân của 1 buổi tập, coi như buổi tập mới tinh — dùng cho
// nút Reset. Trừ ngược đúng phần đã cộng vào MonthlyStatement qua settleSessionCost, xoá hết
// SessionMemberCost của buổi. KHÔNG đụng SessionCost/SessionGuest (dữ liệu nguồn admin đã nhập,
// giữ lại để có thể quyết toán lại). Ném lỗi (không reset gì cả) nếu có sao kê liên quan đã báo
// thanh toán/đã duyệt — tránh làm sai lệch số tiền thực tế đã thu.
export async function resetSessionSettlement(session: SessionDocT) {
  const shares = await SessionMemberCost.find({ session_id: session._id });
  if (shares.length > 0) {
    const month = `${session.date.getUTCFullYear()}-${String(session.date.getUTCMonth() + 1).padStart(2, "0")}`;
    const statements = await MonthlyStatement.find({
      member_id: { $in: shares.map((s) => s.member_id) },
      month,
    });
    if (statements.some((s) => s.status !== "pending")) {
      throw new Error("Không thể reset: sao kê tháng này đã có thành viên báo thanh toán hoặc đã được duyệt");
    }

    for (const share of shares) {
      await MonthlyStatement.findOneAndUpdate(
        { member_id: share.member_id, month },
        { $inc: { total_amount: -share.amount, total_sessions: -1 } }
      );
    }
    await SessionMemberCost.deleteMany({ session_id: session._id });
  }

  const wasCancelled = session.status === "cancelled";
  session.cost_settled_at = undefined;
  session.pass_court_at = undefined;
  // Trạng thái gốc trước khi huỷ không được lưu lại — reset về "scheduled", các trigger sẵn có
  // (vote/reconcileDueAttendance) sẽ tự tính lại đúng confirmed_enough/confirmed_shortage khi cần.
  if (wasCancelled) session.status = "scheduled";
  await session.save();
}

// Buổi tập mà các lệnh chat Telegram (/thamgia, /vang, /diemdanh, ...) sẽ thao tác — buổi gần nhất
// (date >= hôm nay giờ VN) chưa huỷ và chưa quyết toán. Không gắn Session với 1 chat_id cụ thể nào,
// nên tại một thời điểm chấp nhận chỉ nhắm đúng 1 buổi (nếu trùng nhiều buổi cùng ngày, lấy buổi có
// start_time sớm hơn).
export async function findCurrentSessionForMainGroup(): Promise<SessionDocT | null> {
  const today = vnNow();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Session.findOne({
    status: { $ne: "cancelled" },
    cost_settled_at: { $exists: false },
    date: { $gte: todayUTC },
  }).sort({ date: 1, start_time: 1 });
}

// Lệnh /huy: thành viên tự huỷ toàn bộ đăng ký của mình (cả vote điểm danh lẫn khách vãng lai đã
// đăng ký) cho 1 buổi tập — khác PATCH /api/sessions/[id] vốn là admin huỷ nguyên cả buổi tập.
export async function unregisterMember(
  session: SessionDocT,
  member: MemberDocT,
  settings: SettingsDocT
) {
  await Attendance.deleteOne({ session_id: session._id, member_id: member._id });
  await SessionGuest.deleteMany({ session_id: session._id, responsible_member_id: member._id });

  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  return announceAttendanceChange(session, settings, () => [
    `🔄 <b>${member.full_name}</b> đã huỷ đăng ký (cả tham gia lẫn khách vãng lai) buổi tập ${dateLabel}.`,
  ]);
}

// Lệnh /thongke: xếp hạng số buổi có mặt/tổng số buổi đã diễn ra (không tính buổi huỷ) trong tháng
// của monthDate (mặc định tháng hiện tại theo giờ VN), giảm dần theo số buổi có mặt.
export async function getMonthlyAttendanceRanking(monthDate: Date = vnNow()) {
  const monthStart = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1));

  const sessions = await Session.find({
    date: { $gte: monthStart, $lt: monthEnd },
    status: { $ne: "cancelled" },
  });
  const totalSessions = sessions.length;
  if (totalSessions === 0) {
    return { totalSessions: 0, ranking: [] as { full_name: string; presentCount: number }[] };
  }

  const [members, presentAttendances] = await Promise.all([
    Member.find({ status: "active", del_flag: { $ne: true } }).sort({ full_name: 1 }),
    Attendance.find({ session_id: { $in: sessions.map((s) => s._id) }, answer: "present" }),
  ]);

  const countByMember = new Map<string, number>();
  for (const att of presentAttendances) {
    const key = att.member_id.toString();
    countByMember.set(key, (countByMember.get(key) ?? 0) + 1);
  }

  const ranking = members
    .map((m) => ({ full_name: m.full_name as string, presentCount: countByMember.get(m._id.toString()) ?? 0 }))
    .sort((a, b) => b.presentCount - a.presentCount);

  return { totalSessions, ranking };
}

export function shiftMonth(monthStr: string, delta: number) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Chốt sao kê tháng trước vào đúng ngày settings.monthly_settlement_day. Tiền đã được tích luỹ
// dần vào MonthlyStatement suốt tháng qua settleSessionCost (nút Quyết toán / tự động khi huỷ
// buổi) — hàm này CHỈ còn 2 việc: (1) dọn nốt buổi nào trong tháng lỡ bị bỏ sót chưa quyết toán
// (an toàn dự phòng), (2) gửi tin nhắn "sao kê tháng X" cho từng thành viên dựa trên số đã tích
// luỹ sẵn — bước gửi tin này vẫn chỉ chạy đúng 1 lần/tháng như thiết kế cũ.
export async function runDueMonthlySettlement(settings: SettingsDocT) {
  const today = vnNow();
  if (today.getUTCDate() !== settings.monthly_settlement_day) return;

  const currentMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const targetMonth = shiftMonth(currentMonth, -1);

  if (settings.last_monthly_settlement_run === targetMonth) return;

  const [ty, tm] = targetMonth.split("-").map(Number);
  const monthStart = new Date(Date.UTC(ty, tm - 1, 1));
  const monthEnd = new Date(Date.UTC(ty, tm, 1));

  const unsettledSessions = await Session.find({
    date: { $gte: monthStart, $lt: monthEnd },
    status: { $in: ["confirmed_enough", "confirmed_shortage", "cancelled"] },
    cost_settled_at: { $exists: false },
  });
  for (const session of unsettledSessions) {
    await settleSessionCost(session, settings);
  }

  const statements = await MonthlyStatement.find({ month: targetMonth, total_amount: { $gt: 0 } });

  // Áp dụng khoản chi trước (MemberAdvance) còn mở, phát sinh từ targetMonth trở về trước (bắt cả
  // khoản bị bỏ sót ở chu kỳ trước) — mỗi khoản chỉ áp dụng đúng 1 lần: trừ vào total_amount của
  // sao kê tháng này (nếu có), phần dư (chi trước nhiều hơn chi phí thực tế) đánh dấu refund_amount
  // để báo hoàn lại thành viên thay vì tự động cộng dồn sang tháng sau.
  const dueAdvances = await MemberAdvance.find({ status: "open", month: { $lte: targetMonth } });
  const statementByMember = new Map(statements.map((s) => [s.member_id.toString(), s]));
  const advanceResultByMember = new Map<string, { applied: number; refund: number }>();

  for (const advance of dueAdvances) {
    const memberId = advance.member_id.toString();
    const statement = statementByMember.get(memberId);
    const available = statement?.total_amount ?? 0;
    const applied = Math.min(advance.amount, available);

    if (applied > 0 && statement) {
      statement.total_amount -= applied;
      statement.advance_applied = (statement.advance_applied ?? 0) + applied;
      await statement.save();
    }

    const refund = advance.amount - applied;
    advance.status = "settled";
    advance.applied_amount = applied;
    advance.refund_amount = refund;
    advance.settled_at = new Date();
    await advance.save();

    const prev = advanceResultByMember.get(memberId) ?? { applied: 0, refund: 0 };
    advanceResultByMember.set(memberId, { applied: prev.applied + applied, refund: prev.refund + refund });
  }

  if (statements.length === 0 && dueAdvances.length === 0) {
    settings.last_monthly_settlement_run = targetMonth;
    await settings.save();
    return;
  }

  // Chi tiết từng buổi trong tháng (ngày + số tiền) để đính kèm vào tin nhắn riêng từng thành viên,
  // thay vì chỉ đưa tổng số buổi/tổng tiền như trước.
  const sessionsInMonth = await Session.find({
    date: { $gte: monthStart, $lt: monthEnd },
    cost_settled_at: { $exists: true },
  }).sort({ date: 1 });
  const sessionById = new Map(sessionsInMonth.map((s) => [s._id.toString(), s]));
  const memberCosts = await SessionMemberCost.find({
    session_id: { $in: sessionsInMonth.map((s) => s._id) },
  });
  const costsByMember = new Map<string, typeof memberCosts>();
  for (const c of memberCosts) {
    const key = c.member_id.toString();
    if (!costsByMember.has(key)) costsByMember.set(key, []);
    costsByMember.get(key)!.push(c);
  }

  let totalClub = 0;
  let totalAdvanceApplied = 0;
  let totalAdvanceRefund = 0;
  for (const statement of statements) {
    const member = await Member.findById(statement.member_id);
    if (!member) continue;

    totalClub += statement.total_amount;
    const advanceResult = advanceResultByMember.get(statement.member_id.toString());
    if (advanceResult) {
      totalAdvanceApplied += advanceResult.applied;
      totalAdvanceRefund += advanceResult.refund;
    }

    if (member.statement_chat_id) {
      const detailLines = (costsByMember.get(statement.member_id.toString()) ?? [])
        .map((c) => {
          const session = sessionById.get(c.session_id.toString());
          const label = session ? formatVNDate(session.date) : "?";
          return `- ${label}: ${c.amount.toLocaleString("vi-VN")}đ`;
        })
        .join("\n");

      const advanceLines: string[] = [];
      if (advanceResult?.applied) {
        advanceLines.push(`Đã trừ khoản chi trước: ${advanceResult.applied.toLocaleString("vi-VN")}đ`);
      }
      if (advanceResult?.refund) {
        advanceLines.push(
          `Còn dư khoản chi trước: ${advanceResult.refund.toLocaleString("vi-VN")}đ, sẽ được hoàn lại.`
        );
      }

      await sendMessage(
        member.statement_chat_id,
        [
          `📄 <b>Sao kê tháng ${targetMonth}</b>`,
          `Số buổi tham gia: ${statement.total_sessions}`,
          ...(detailLines ? ["", "Chi tiết:", detailLines] : []),
          ...(advanceLines.length > 0 ? ["", ...advanceLines] : []),
          "",
          `Tổng tiền cần đóng: <b>${statement.total_amount.toLocaleString("vi-VN")}đ</b>`,
        ].join("\n"),
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

  // Thành viên có khoản chi trước dư cần hoàn nhưng không có sao kê tháng này (VD không tập buổi
  // nào trong tháng) — chưa được gửi tin ở vòng lặp trên nên báo riêng.
  for (const [memberId, result] of advanceResultByMember) {
    if (statementByMember.has(memberId) || result.refund <= 0) continue;
    const member = await Member.findById(memberId);
    if (!member?.statement_chat_id) continue;
    totalAdvanceRefund += result.refund;
    await sendMessage(
      member.statement_chat_id,
      `📄 <b>Sao kê tháng ${targetMonth}</b>\nKhông có chi phí buổi tập nào tháng này. Khoản chi trước ${result.refund.toLocaleString("vi-VN")}đ sẽ được hoàn lại.`
    );
  }

  if (settings.main_group_chat_id && statements.length > 0) {
    await sendMessage(
      settings.main_group_chat_id,
      `📄 Đã có sao kê tháng ${targetMonth}. Mời mọi người xem chi tiết và số tiền cần thanh toán trong nhóm riêng.`
    );
  }

  if (settings.admin_group_chat_id) {
    const advanceSummary =
      totalAdvanceApplied > 0 || totalAdvanceRefund > 0
        ? `\nKhoản chi trước: đã trừ ${totalAdvanceApplied.toLocaleString("vi-VN")}đ, cần hoàn ${totalAdvanceRefund.toLocaleString("vi-VN")}đ.`
        : "";
    await sendMessage(
      settings.admin_group_chat_id,
      `📊 Đã chốt sao kê tháng ${targetMonth}: ${statements.length} thành viên, tổng ${totalClub.toLocaleString("vi-VN")}đ.${advanceSummary}`
    );
  }

  settings.last_monthly_settlement_run = targetMonth;
  await settings.save();
}
