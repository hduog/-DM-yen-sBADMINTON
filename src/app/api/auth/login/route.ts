import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Member } from "@/lib/models";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE_MAX_AGE, SESSION_COOKIE_NAME } from "@/lib/session";

// telegram_id không bao giờ âm ngoài đời thật nên dùng làm mốc riêng cho tài khoản admin dự phòng.
const ENV_ADMIN_TELEGRAM_ID = -1;

// Đăng nhập fallback bằng username/password — dùng khi mở app ngoài Telegram, hoặc initData
// verify thất bại/lỗi. Áp dụng cho cả member (password do admin đặt ở trang chi tiết thành viên)
// lẫn admin (ưu tiên ADMIN_EMAIL/ADMIN_PASSWORD trong env để bootstrap tài khoản admin đầu tiên).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "Thiếu tài khoản hoặc mật khẩu" }, { status: 400 });
  }

  await connectDB();

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  let member;

  if (adminEmail && adminPassword && username === adminEmail && password === adminPassword) {
    member = await Member.findOneAndUpdate(
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
  } else {
    const candidate = await Member.findOne({
      username,
      status: "active",
      del_flag: { $ne: true },
    }).select("+password_hash");

    if (candidate?.password_hash && (await verifyPassword(password, candidate.password_hash))) {
      member = candidate;
    }
  }

  if (!member) {
    return NextResponse.json({ error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
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
