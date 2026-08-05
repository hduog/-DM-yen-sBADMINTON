import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Member } from "@/lib/models";
import { verifyTelegramInitData } from "@/lib/telegram-auth";
import { createSessionToken, SESSION_COOKIE_MAX_AGE, SESSION_COOKIE_NAME } from "@/lib/session";

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
  const member = await Member.findOne({ telegram_id: verified.user.id });

  if (!member || member.status !== "active" || member.del_flag) {
    return NextResponse.json(
      { error: "Bạn không có quyền truy cập Mini App này" },
      { status: 403 }
    );
  }

  const token = await createSessionToken({
    memberId: member._id.toString(),
    telegramId: member.telegram_id,
    fullName: member.full_name,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });

  return NextResponse.json({
    ok: true,
    member: { id: member._id, full_name: member.full_name, role: member.role },
  });
}
