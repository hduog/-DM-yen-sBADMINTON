import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Member } from "@/lib/models";
import { verifyTelegramInitData } from "@/lib/telegram-auth";

// Dùng khi DB chưa có admin nào: tạo 1 member thường từ Telegram initData,
// sau đó admin hệ thống tự vào DB nâng role lên "admin" cho tài khoản này.
export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Server chưa cấu hình bot" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const initData = body?.initData;
  if (typeof initData !== "string" || !initData) {
    return NextResponse.json({ error: "Thiếu initData" }, { status: 400 });
  }

  const verified = await verifyTelegramInitData(initData, botToken);
  if (!verified) {
    return NextResponse.json({ error: "initData không hợp lệ" }, { status: 401 });
  }

  await connectDB();

  const existing = await Member.findOne({ telegram_id: verified.user.id });
  if (existing) {
    return NextResponse.json({ ok: true, alreadyExists: true });
  }

  const fullName =
    [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ").trim() ||
    verified.user.username ||
    `User ${verified.user.id}`;

  await Member.create({
    telegram_id: verified.user.id,
    full_name: fullName,
    username: verified.user.username,
    role: "member",
    status: "active",
  });

  return NextResponse.json({ ok: true });
}
