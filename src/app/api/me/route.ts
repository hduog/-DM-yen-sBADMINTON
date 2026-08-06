import { NextResponse } from "next/server";
import { requireActiveMember } from "@/lib/auth-guard";

// Dùng để kiểm tra cookie session hiện có còn hợp lệ không (VD: khi mở lại Mini App) mà không
// cần re-verify Telegram initData mỗi lần — xem src/app/page.tsx.
export async function GET() {
  const member = await requireActiveMember();
  if (!member) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  return NextResponse.json({
    id: member._id,
    full_name: member.full_name,
    username: member.username,
    role: member.role,
  });
}
