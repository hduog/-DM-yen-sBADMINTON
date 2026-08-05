import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Member, Session, SessionGuest } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { announceAttendanceChange } from "@/lib/session-actions";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const guests = await SessionGuest.find({ session_id: id })
    .populate("responsible_member_id", "full_name")
    .sort({ createdAt: 1 });
  return NextResponse.json(guests);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const quantity = Number(body?.quantity ?? 1);
  const responsibleMemberId = body?.responsible_member_id;

  if (!responsibleMemberId || typeof responsibleMemberId !== "string") {
    return NextResponse.json({ error: "Vui lòng chọn người chịu trách nhiệm" }, { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: "Số lượng không hợp lệ" }, { status: 400 });
  }

  await connectDB();

  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });
  if (session.cost_settled_at || session.pass_court_at || session.status === "cancelled") {
    return NextResponse.json({ error: "Buổi tập đã quyết toán hoặc đã huỷ, không thể chỉnh sửa" }, { status: 400 });
  }

  const member = await Member.findOne({ _id: responsibleMemberId, del_flag: { $ne: true } });
  if (!member) {
    return NextResponse.json({ error: "Không tìm thấy thành viên chịu trách nhiệm" }, { status: 404 });
  }

  const guestName = typeof body?.guest_name === "string" ? body.guest_name.trim() : "";
  const guest = await SessionGuest.create({
    session_id: id,
    guest_name: guestName || undefined,
    quantity,
    responsible_member_id: responsibleMemberId,
  });

  const settings = await getSettings();
  await announceAttendanceChange(session, settings, () => [
    `🎟️ <b>${admin.full_name}</b> đã thêm khách vãng lai <b>${guestName || "(không tên)"}</b> × ${quantity} (người chịu trách nhiệm: <b>${member.full_name}</b>).`,
  ]);

  return NextResponse.json(guest, { status: 201 });
}
