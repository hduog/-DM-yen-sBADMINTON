import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  const member = await requireAdmin();
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
