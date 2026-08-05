import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { MonthlyStatement } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  const query: Record<string, unknown> = {};
  if (memberId) query.member_id = memberId;
  if (month && year) query.month = `${year}-${String(Number(month)).padStart(2, "0")}`;

  const statements = await MonthlyStatement.find(query)
    .sort({ month: -1 })
    .populate("member_id", "full_name");
  return NextResponse.json(statements);
}
