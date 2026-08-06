import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Attendance, Member, MonthlyStatement, SessionGuest } from "@/lib/models";
import { answerCallbackQuery, sendMessage } from "@/lib/telegram";
import { getSettings } from "@/lib/models/Settings";
import {
  announceAttendanceChange,
  assertGuestEditable,
  combineVNDateTime,
  findCurrentSessionForMainGroup,
  formatVNDate,
  getMonthlyAttendanceRanking,
  getSessionAttendanceDetail,
  getSessionCostUnits,
  recordAttendanceVote,
  unregisterMember,
} from "@/lib/session-actions";
type TelegramUpdate = {
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; first_name: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { chat: { id: number } };
  };
};

type TelegramMessage = NonNullable<TelegramUpdate["message"]>;

const HELP_TEXT = [
  "📖 <b>Danh sách lệnh CLB</b>",
  "",
  "/thamgia - Tham gia buổi tập (bản thân)",
  "/vang &lt;lý do&gt; - Vắng buổi tập, không tham gia (bắt buộc kèm lý do)",
  "/them1vanglai - Thêm 1 khách vãng lai đi cùng bạn",
  "/tru1vanglai - Bớt 1 khách vãng lai (lỡ đăng ký dư)",
  "/diemdanh - Xem danh sách đã điểm danh buổi tập gần nhất",
  "/soluong - Xem tổng số người tham gia + khách vãng lai",
  "/huy - Hủy toàn bộ đăng ký của bạn (cả tham gia lẫn khách)",
  "/nhac - Nhắc những ai chưa điểm danh",
  "/thongke - Thống kê điểm danh theo tháng",
  "/help - Hướng dẫn cách dùng các lệnh",
].join("\n");

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (expectedSecret && receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid secret token" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  await connectDB();

  if (update.message) await handleMessage(update.message);
  if (update.callback_query) await handleCallbackQuery(update.callback_query);

  return NextResponse.json({ ok: true });
}

async function handleMessage(message: TelegramMessage) {
  const rawText = message.text?.trim();
  if (!rawText) return;

  // Telegram gửi kèm "@bot_username" khi lệnh được gõ trong group (VD "/thamgia@YenCLBBot") — bỏ
  // phần đó trước khi so khớp lệnh.
  const [rawCommand, ...rest] = rawText.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const argsText = rest.join(" ").trim();

  switch (command) {
    case "/start":
      await sendMessage(
        message.chat.id,
        "Chào mừng đến với bot quản lý CLB! Bot sẽ gửi thông báo điểm danh, nhắc chi phí và sao kê hàng tháng tại đây."
      );
      return;
    case "/getid":
      // Tiện ích cho admin lấy chat_id khi setup nhóm chính/nhóm quản trị/nhóm riêng từng member — xem mục 1.3.
      await sendMessage(message.chat.id, `Chat ID: <code>${message.chat.id}</code>`);
      return;
    case "/help":
      await sendMessage(message.chat.id, HELP_TEXT);
      return;
    case "/thamgia":
      await handleThamGia(message);
      return;
    case "/vang":
      await handleVang(message, argsText);
      return;
    case "/them1vanglai":
      await handleThem1VangLai(message);
      return;
    case "/tru1vanglai":
      await handleTru1VangLai(message);
      return;
    case "/diemdanh":
      await handleDiemDanh(message);
      return;
    case "/soluong":
      await handleSoLuong(message);
      return;
    case "/huy":
      await handleHuy(message);
      return;
    case "/nhac":
      await handleNhac(message);
      return;
    case "/thongke":
      await handleThongKe(message);
      return;
    default:
      return;
  }
}

// Điều kiện dùng chung cho mọi lệnh chat gắn với 1 thành viên: chỉ nhận trong đúng nhóm chính đã
// cấu hình, người gõ phải là Member active đã từng tham gia qua Mini App (định danh qua
// message.from.id === Member.telegram_id).
async function resolveGroupMemberContext(message: TelegramMessage) {
  const settings = await getSettings();
  if (!settings.main_group_chat_id || message.chat.id !== settings.main_group_chat_id) {
    await sendMessage(message.chat.id, "Lệnh này chỉ dùng được trong nhóm chính của CLB.");
    return null;
  }

  const fromId = message.from?.id;
  const member = fromId
    ? await Member.findOne({ telegram_id: fromId, status: "active", del_flag: { $ne: true } })
    : null;
  if (!member) {
    await sendMessage(
      message.chat.id,
      "Không tìm thấy bạn trong danh sách thành viên. Vui lòng mở Mini App qua nút menu của bot để tham gia CLB trước."
    );
    return null;
  }

  return { member, settings };
}

// Thêm điều kiện phải có "buổi tập hiện tại" (xem findCurrentSessionForMainGroup) — dùng cho các
// lệnh thao tác trực tiếp lên 1 buổi tập cụ thể.
async function resolveSessionCommandContext(message: TelegramMessage) {
  const base = await resolveGroupMemberContext(message);
  if (!base) return null;

  const session = await findCurrentSessionForMainGroup();
  if (!session) {
    await sendMessage(message.chat.id, "Hiện không có buổi tập nào đang mở điểm danh.");
    return null;
  }

  return { ...base, session };
}

function isAttendanceWindowClosed(session: Awaited<ReturnType<typeof findCurrentSessionForMainGroup>>) {
  if (!session) return true;
  return new Date() >= combineVNDateTime(session.date, session.start_time);
}

// Buổi đã đạt session.min_required (member "present" + khách vãng lai — xem announceQuotaReached
// trong session-actions.ts, hàm này tự chuyển status sang confirmed_enough ngay khi đạt mốc) thì
// khoá không cho tăng thêm số lượng qua /thamgia, /them1vanglai nữa. /vang, /tru1vanglai (giảm số
// lượng) không bị khoá vì không làm buổi vượt quá quy mô.
function sessionFullMessage(
  session: NonNullable<Awaited<ReturnType<typeof findCurrentSessionForMainGroup>>>
): string | null {
  if (session.status !== "confirmed_enough") return null;
  return `⚠️ Buổi tập đã đủ người tham gia (${session.min_required}/${session.min_required}), không thể đăng ký thêm.`;
}

async function handleThamGia(message: TelegramMessage) {
  const ctx = await resolveSessionCommandContext(message);
  if (!ctx) return;
  const { member, session, settings } = ctx;

  if (isAttendanceWindowClosed(session)) {
    await sendMessage(message.chat.id, "Đã quá giờ, buổi tập đã bắt đầu nên không thể điểm danh nữa.");
    return;
  }

  const existing = await Attendance.findOne({ session_id: session._id, member_id: member._id });
  if (existing?.answer === "present") {
    await sendMessage(message.chat.id, "Bạn đã đăng ký tham gia buổi tập này rồi.");
    return;
  }

  const fullMessage = sessionFullMessage(session);
  if (fullMessage) {
    await sendMessage(message.chat.id, fullMessage);
    return;
  }

  await recordAttendanceVote(session, member, "present", undefined, settings);
}

async function handleVang(message: TelegramMessage, argsText: string) {
  const reason = argsText.trim();
  if (!reason) {
    await sendMessage(
      message.chat.id,
      "Vui lòng nhập lý do không tham gia, ví dụ: /vang Bận việc gia đình"
    );
    return;
  }

  const ctx = await resolveSessionCommandContext(message);
  if (!ctx) return;
  const { member, session, settings } = ctx;

  if (isAttendanceWindowClosed(session)) {
    await sendMessage(message.chat.id, "Đã quá giờ, buổi tập đã bắt đầu nên không thể điểm danh nữa.");
    return;
  }

  const existing = await Attendance.findOne({ session_id: session._id, member_id: member._id });
  if (existing?.answer === "absent") {
    await sendMessage(
      message.chat.id,
      `Bạn đã vote vắng buổi tập này rồi${existing.reason ? ` (lý do: ${existing.reason})` : ""}.`
    );
    return;
  }

  await recordAttendanceVote(session, member, "absent", reason, settings);
}

async function handleThem1VangLai(message: TelegramMessage) {
  const ctx = await resolveSessionCommandContext(message);
  if (!ctx) return;
  const { member, session, settings } = ctx;

  const lockError = assertGuestEditable(session);
  if (lockError) {
    await sendMessage(message.chat.id, lockError);
    return;
  }

  const fullMessage = sessionFullMessage(session);
  if (fullMessage) {
    await sendMessage(message.chat.id, fullMessage);
    return;
  }

  await SessionGuest.findOneAndUpdate(
    { session_id: session._id, responsible_member_id: member._id },
    {
      $inc: { quantity: 1 },
      $setOnInsert: { guest_name: `Bạn của ${member.full_name}` },
    },
    { upsert: true }
  );

  await announceAttendanceChange(session, settings, () => [
    `🎟️ <b>${member.full_name}</b> đã thêm 1 khách vãng lai.`,
  ]);
}

async function handleTru1VangLai(message: TelegramMessage) {
  const ctx = await resolveSessionCommandContext(message);
  if (!ctx) return;
  const { member, session, settings } = ctx;

  const lockError = assertGuestEditable(session);
  if (lockError) {
    await sendMessage(message.chat.id, lockError);
    return;
  }

  const guest = await SessionGuest.findOne({ session_id: session._id, responsible_member_id: member._id });
  if (!guest) {
    await sendMessage(message.chat.id, "Bạn chưa đăng ký khách vãng lai nào để bớt.");
    return;
  }

  if (guest.quantity <= 1) {
    await guest.deleteOne();
  } else {
    guest.quantity -= 1;
    await guest.save();
  }

  await announceAttendanceChange(session, settings, () => [
    `🗑️ <b>${member.full_name}</b> đã bớt 1 khách vãng lai.`,
  ]);
}

async function handleDiemDanh(message: TelegramMessage) {
  const ctx = await resolveSessionCommandContext(message);
  if (!ctx) return;
  const { session } = ctx;

  const detail = await getSessionAttendanceDetail(session._id.toString());
  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const presentNames = detail.list.filter((m) => m.answer === "present").map((m) => m.full_name);
  const absentNames = detail.list.filter((m) => m.answer === "absent").map((m) => m.full_name);
  const pendingNames = detail.list.filter((m) => m.answer === "no_response").map((m) => m.full_name);

  const lines = [
    `📋 Điểm danh buổi tập ${dateLabel}`,
    "",
    `✅ Tham gia (${presentNames.length}): ${presentNames.length > 0 ? presentNames.join(", ") : "(chưa ai)"}`,
    `❌ Không tham gia (${absentNames.length}): ${absentNames.length > 0 ? absentNames.join(", ") : "(chưa ai)"}`,
    `⏳ Chưa điểm danh (${pendingNames.length}): ${pendingNames.length > 0 ? pendingNames.join(", ") : "(không ai)"}`,
  ];

  await sendMessage(message.chat.id, lines.join("\n"));
}

async function handleSoLuong(message: TelegramMessage) {
  const ctx = await resolveSessionCommandContext(message);
  if (!ctx) return;
  const { session } = ctx;

  const { totalUnits } = await getSessionCostUnits(session._id.toString());
  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;

  await sendMessage(
    message.chat.id,
    `🧮 Buổi tập ${dateLabel}: đã có <b>${totalUnits}/${session.min_required}</b> người tham gia (gồm khách vãng lai).`
  );
}

async function handleHuy(message: TelegramMessage) {
  const ctx = await resolveSessionCommandContext(message);
  if (!ctx) return;
  const { member, session, settings } = ctx;

  const lockError = assertGuestEditable(session);
  if (lockError) {
    await sendMessage(message.chat.id, lockError);
    return;
  }

  await unregisterMember(session, member, settings);
}

async function handleNhac(message: TelegramMessage) {
  const ctx = await resolveSessionCommandContext(message);
  if (!ctx) return;
  const { session } = ctx;

  const detail = await getSessionAttendanceDetail(session._id.toString());
  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const pending = detail.list.filter((m) => m.answer === "no_response");

  const text =
    pending.length > 0
      ? `🔔 Nhắc điểm danh buổi tập ${dateLabel}: ${pending
          .map((m) => m.full_name)
          .join(", ")} chưa điểm danh, vào bình chọn nhé!`
      : `🔔 Buổi tập ${dateLabel}: mọi người đã điểm danh đầy đủ 🎉`;

  await sendMessage(message.chat.id, text);
}

async function handleThongKe(message: TelegramMessage) {
  const ctx = await resolveGroupMemberContext(message);
  if (!ctx) return;

  const { totalSessions, ranking } = await getMonthlyAttendanceRanking();
  if (totalSessions === 0) {
    await sendMessage(message.chat.id, "Tháng này chưa có buổi tập nào diễn ra.");
    return;
  }

  const lines = [
    `📊 Thống kê điểm danh tháng này (${totalSessions} buổi đã diễn ra)`,
    "",
    ...ranking.map((r, i) => `${i + 1}. ${r.full_name}: ${r.presentCount}/${totalSessions} buổi`),
  ];

  await sendMessage(message.chat.id, lines.join("\n"));
}

async function handleCallbackQuery(
  callbackQuery: NonNullable<TelegramUpdate["callback_query"]>
) {
  const data = callbackQuery.data ?? "";

  if (data.startsWith("paid:")) {
    const statementId = data.slice("paid:".length);
    const statement = await MonthlyStatement.findById(statementId);
    if (!statement) {
      await answerCallbackQuery(callbackQuery.id, { text: "Không tìm thấy sao kê." });
      return;
    }

    statement.status = "paid_reported";
    statement.paid_reported_at = new Date();
    await statement.save();

    await answerCallbackQuery(callbackQuery.id, { text: "Đã ghi nhận, chờ admin duyệt." });

    const member = await Member.findById(statement.member_id);
    const settings = await getSettings();
    if (settings.admin_group_chat_id && member) {
      await sendMessage(
        settings.admin_group_chat_id,
        `💰 <b>${member.full_name}</b> báo đã thanh toán tháng ${statement.month}. Vào Mini App để duyệt.`
      );
    }
    return;
  }

  await answerCallbackQuery(callbackQuery.id);
}
