import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { MemberAdvance } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

const MONTH_RE = /^\d{4}-\d{2}$/;

// Sửa/xoá khoản chi trước — admin toàn quyền kể cả khi khoản đã bị dùng để trừ vào sao kê tháng
// trước đó (status "settled"): hệ thống KHÔNG tự động điều chỉnh lại các sao kê đã chốt.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; advanceId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id, advanceId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });

  await connectDB();
  const advance = await MemberAdvance.findOne({ _id: advanceId, member_id: id });
  if (!advance) return NextResponse.json({ error: "Không tìm thấy khoản chi trước" }, { status: 404 });

  if ("amount" in body) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Số tiền không hợp lệ" }, { status: 400 });
    }
    advance.amount = amount;
  }

  if ("month" in body) {
    if (typeof body.month !== "string" || !MONTH_RE.test(body.month)) {
      return NextResponse.json({ error: "Tháng không hợp lệ (định dạng YYYY-MM)" }, { status: 400 });
    }
    advance.month = body.month;
  }

  if ("note" in body) {
    const note = typeof body.note === "string" ? body.note.trim() : "";
    advance.note = note || undefined;
  }

  await advance.save();
  return NextResponse.json(advance);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; advanceId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id, advanceId } = await params;
  await connectDB();

  const advance = await MemberAdvance.findOneAndDelete({ _id: advanceId, member_id: id });
  if (!advance) return NextResponse.json({ error: "Không tìm thấy khoản chi trước" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
