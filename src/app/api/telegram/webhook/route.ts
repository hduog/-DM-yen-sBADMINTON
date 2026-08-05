import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Member, MonthlyStatement } from "@/lib/models";
import { answerCallbackQuery, sendMessage } from "@/lib/telegram";
import { getSettings } from "@/lib/models/Settings";

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

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const text = message.text?.trim();
  if (!text) return;

  if (text.startsWith("/start")) {
    await sendMessage(
      message.chat.id,
      "Chào mừng đến với bot quản lý CLB! Bot sẽ gửi thông báo điểm danh, nhắc chi phí và sao kê hàng tháng tại đây."
    );
    return;
  }

  if (text.startsWith("/getid")) {
    // Tiện ích cho admin lấy chat_id khi setup nhóm chính/nhóm quản trị/nhóm riêng từng member — xem mục 1.3.
    await sendMessage(message.chat.id, `Chat ID: <code>${message.chat.id}</code>`);
    return;
  }
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
