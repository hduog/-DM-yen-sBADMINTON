import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Member } from "@/lib/models";
import { hashPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE_MAX_AGE, SESSION_COOKIE_NAME } from "@/lib/session";

// Tự đăng ký tài khoản member bằng username/password, không cần qua Telegram — dùng khi mở app
// ngoài Telegram hoặc Telegram lỗi. Member tạo theo cách này không có telegram_id thật nên được
// gán 1 telegram_id âm (giả, không đụng dải id thật của Telegram luôn dương) để không phải nới
// lỏng ràng buộc required+unique của trường này ở nơi khác trong hệ thống.
async function generateFakeTelegramId(): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    if (!(await Member.exists({ telegram_id: candidate }))) return candidate;
  }
  throw new Error("Không tạo được tài khoản, vui lòng thử lại");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!fullName || !username || !password) {
    return NextResponse.json({ error: "Vui lòng nhập đầy đủ họ tên, tài khoản và mật khẩu" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu cần tối thiểu 6 ký tự" }, { status: 400 });
  }

  await connectDB();

  const existing = await Member.findOne({ username });
  if (existing) {
    return NextResponse.json({ error: "Tài khoản này đã được đăng ký" }, { status: 409 });
  }

  const telegramId = await generateFakeTelegramId();
  const passwordHash = await hashPassword(password);

  let member;
  try {
    member = await Member.create({
      telegram_id: telegramId,
      full_name: fullName,
      username,
      password_hash: passwordHash,
      role: "member",
      status: "active",
    });
  } catch {
    return NextResponse.json({ error: "Tài khoản này đã được đăng ký" }, { status: 409 });
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
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });

  return NextResponse.json({
    ok: true,
    member: { id: member._id, full_name: member.full_name, role: member.role },
  });
}
