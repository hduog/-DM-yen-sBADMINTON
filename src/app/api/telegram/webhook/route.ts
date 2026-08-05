import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Attendance, Member, MonthlyStatement, Session } from "@/lib/models";
import type { SessionDoc } from "@/lib/models/Session";
import { answerCallbackQuery, sendMessage } from "@/lib/telegram";
import { getSettings } from "@/lib/models/Settings";
import { formatVNDate } from "@/lib/session-actions";
import type { HydratedDocument } from "mongoose";

type TelegramUpdate = {
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; first_name: string; username?: string };
    text?: string;
  };
  poll_answer?: {
    poll_id: string;
    user: { id: number; first_name: string; username?: string };
    option_ids: number[];
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { chat: { id: number } };
  };
};

// Poll điểm danh dùng option ["Có", "Không"] — index 0 = present, 1 = absent. Xem handleSendPoll.
const PRESENT_OPTION_INDEX = 0;

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
  if (update.poll_answer) await handlePollAnswer(update.poll_answer);
  if (update.callback_query) await handleCallbackQuery(update.callback_query);

  return NextResponse.json({ ok: true });
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const text = message.text?.trim();
  if (!text) return;

  if (text.startsWith("/start")) {
    await sendMessage(
      message.chat.id,
      "Chào mừng đến với bot quản lý CLB! Bot sẽ gửi poll điểm danh, nhắc chi phí và sao kê hàng tháng tại đây."
    );
    return;
  }

  if (text.startsWith("/getid")) {
    // Tiện ích cho admin lấy chat_id khi setup nhóm chính/nhóm quản trị/nhóm riêng từng member — xem mục 1.3.
    await sendMessage(message.chat.id, `Chat ID: <code>${message.chat.id}</code>`);
    return;
  }
}

async function handlePollAnswer(pollAnswer: NonNullable<TelegramUpdate["poll_answer"]>) {
  const session = await Session.findOne({ poll_id: pollAnswer.poll_id });
  if (!session) return;

  const member = await Member.findOne({ telegram_id: pollAnswer.user.id });
  if (!member) return;

  const hasAnswer = pollAnswer.option_ids.length > 0;
  const answer = !hasAnswer
    ? "no_response"
    : pollAnswer.option_ids[0] === PRESENT_OPTION_INDEX
      ? "present"
      : "absent";

  await Attendance.findOneAndUpdate(
    { session_id: session._id, member_id: member._id },
    { answer, answered_at: new Date() },
    { upsert: true }
  );

  if (answer === "present" && session.status === "scheduled") {
    await checkAndAnnounceQuota(session);
  }
}

// Chốt đủ người ngay khi vote "Có" vừa chạm mốc min_required, thay vì đợi mốc T-5h
// (reconcileDueAttendance chỉ còn lo nhánh thiếu người — xem src/lib/session-actions.ts).
async function checkAndAnnounceQuota(session: HydratedDocument<SessionDoc>) {
  const presentCount = await Attendance.countDocuments({
    session_id: session._id,
    answer: "present",
  });
  if (presentCount < session.min_required) return;

  session.status = "confirmed_enough";
  session.confirmation_sent_at = new Date();
  await session.save();

  const settings = await getSettings();
  const dateLabel = `${formatVNDate(session.date)} (${session.start_time}-${session.end_time})`;
  const text = `✅ Buổi tập ${dateLabel} đã đủ người (${presentCount}/${session.min_required}).`;
  if (settings.main_group_chat_id) await sendMessage(settings.main_group_chat_id, text);
  if (settings.admin_group_chat_id) await sendMessage(settings.admin_group_chat_id, text);
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
