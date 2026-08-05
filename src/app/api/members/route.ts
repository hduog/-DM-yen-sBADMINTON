import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Member } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await connectDB();
  const members = await Member.find({ del_flag: { $ne: true } }).sort({ joined_at: -1 });
  return NextResponse.json(members);
}
