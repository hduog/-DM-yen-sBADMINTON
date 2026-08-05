import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { MonthlyStatement } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await connectDB();
  const statements = await MonthlyStatement.find()
    .sort({ month: -1 })
    .populate("member_id", "full_name");
  return NextResponse.json(statements);
}
