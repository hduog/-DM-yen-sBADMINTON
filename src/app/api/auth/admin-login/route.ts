import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Member } from "@/lib/models";
import { createSessionToken, SESSION_COOKIE_MAX_AGE, SESSION_COOKIE_NAME } from "@/lib/session";

// telegram_id không bao giờ âm ngoài đời thật nên dùng làm mốc riêng cho tài khoản admin dự phòng.
const ENV_ADMIN_TELEGRAM_ID = -1;

// Đăng nhập bằng ADMIN_EMAIL/ADMIN_PASSWORD (không qua Telegram) — dùng khi test/dev trên trình
// duyệt thường, hoặc trước khi có admin thật nào trong DB. Tự upsert 1 Member role=admin tương ứng.
export async function POST(request: NextRequest) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: "Server chưa cấu hình ADMIN_EMAIL/ADMIN_PASSWORD" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = body?.email;
  const password = body?.password;

  if (email !== adminEmail || password !== adminPassword) {
    return NextResponse.json({ error: "Sai email hoặc mật khẩu" }, { status: 401 });
  }

  await connectDB();
  const member = await Member.findOneAndUpdate(
    { telegram_id: ENV_ADMIN_TELEGRAM_ID },
    {
      telegram_id: ENV_ADMIN_TELEGRAM_ID,
      full_name: "Admin",
      role: "admin",
      status: "active",
      del_flag: false,
    },
    { upsert: true, new: true }
  );

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
