import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Member, MemberAdvance } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const advances = await MemberAdvance.find({ member_id: id }).sort({ month: -1, createdAt: -1 });
  return NextResponse.json(advances);
}

// Thêm 1 khoản chi trước (VD cọc sân) cho thành viên trong 1 tháng — sẽ được trừ vào tổng tiền
// buổi tập của thành viên đó đúng lúc chốt sao kê tháng (xem runDueMonthlySettlement).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  const month = body?.month;
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Số tiền không hợp lệ" }, { status: 400 });
  }
  if (typeof month !== "string" || !MONTH_RE.test(month)) {
    return NextResponse.json({ error: "Tháng không hợp lệ (định dạng YYYY-MM)" }, { status: 400 });
  }

  await connectDB();

  const member = await Member.findOne({ _id: id, del_flag: { $ne: true } });
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên" }, { status: 404 });

  const advance = await MemberAdvance.create({
    member_id: id,
    month,
    amount,
    note: note || undefined,
    status: "open",
  });

  return NextResponse.json(advance, { status: 201 });
}
