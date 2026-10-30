import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";
import { vnNow } from "@/lib/session-actions";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Lọc theo tháng (?month=YYYY-MM, mặc định tháng hiện tại giờ VN) để tránh tải quá nhiều buổi.
  // Sắp xếp ngày mới nhất trước.
  const monthParam = request.nextUrl.searchParams.get("month");
  let year: number;
  let month: number; // 0-based
  const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]) - 1;
    if (month < 0 || month > 11) return NextResponse.json({ error: "Tháng không hợp lệ" }, { status: 400 });
  } else {
    const today = vnNow();
    year = today.getUTCFullYear();
    month = today.getUTCMonth();
  }
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 1));

  await connectDB();
  const sessions = await Session.find({ date: { $gte: from, $lt: to } }).sort({ date: -1, start_time: -1 });
  return NextResponse.json(sessions);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.date || !body?.start_time || !body?.end_time || !body?.min_required) {
    return NextResponse.json({ error: "Thiếu thông tin buổi tập" }, { status: 400 });
  }

  await connectDB();
  const session = await Session.create({
    date: new Date(body.date),
    start_time: body.start_time,
    end_time: body.end_time,
    min_required: Number(body.min_required),
  });

  return NextResponse.json(session, { status: 201 });
}
