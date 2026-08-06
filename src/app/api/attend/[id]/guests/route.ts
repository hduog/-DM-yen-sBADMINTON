import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session, SessionGuest } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireActiveMember } from "@/lib/auth-guard";
import { announceAttendanceChange, assertGuestEditable, getMemberGuests } from "@/lib/session-actions";

// Đăng ký khách vãng lai từ trang /attend/[id] — khác API admin (/api/sessions/[id]/guests) ở chỗ
// người đăng ký (member đang đăng nhập) luôn là người chịu trách nhiệm chi phí, không được chọn
// người khác.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await requireActiveMember();
  if (!member) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const quantity = Number(body?.quantity ?? 1);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: "Số lượng không hợp lệ" }, { status: 400 });
  }
  const guestName = typeof body?.guest_name === "string" ? body.guest_name.trim() : "";

  await connectDB();
  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });
  const lockError = assertGuestEditable(session);
  if (lockError) return NextResponse.json({ error: lockError }, { status: 400 });

  await SessionGuest.create({
    session_id: id,
    guest_name: guestName || undefined,
    quantity,
    responsible_member_id: member._id,
  });

  const settings = await getSettings();
  const { detail, costUnits } = await announceAttendanceChange(session, settings, () => [
    `🎟️ <b>${member.full_name}</b> đã đăng ký khách vãng lai <b>${guestName || "(không tên)"}</b> × ${quantity}.`,
  ]);

  const myGuests = await getMemberGuests(id, member._id.toString());
  return NextResponse.json(
    { ...detail, totalUnits: costUnits.totalUnits, viewerMemberId: member._id.toString(), myGuests },
    { status: 201 }
  );
}
