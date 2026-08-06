import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session, SessionGuest } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireActiveMember } from "@/lib/auth-guard";
import { announceAttendanceChange, assertGuestEditable, getMemberGuests } from "@/lib/session-actions";

// Sửa/xoá khách vãng lai do chính member đăng nhập đã đăng ký (responsible_member_id === chính
// họ) từ trang /attend/[id]. Member không thể đụng vào khách của người khác — việc đó vẫn chỉ
// admin làm được qua /api/sessions/[id]/guests.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> }
) {
  const member = await requireActiveMember();
  if (!member) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id, guestId } = await params;
  const body = await request.json().catch(() => null);
  const quantity = Number(body?.quantity ?? 1);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: "Số lượng không hợp lệ" }, { status: 400 });
  }
  const guestName = typeof body?.guest_name === "string" ? body.guest_name.trim() : "";

  await connectDB();
  const guest = await SessionGuest.findOne({ _id: guestId, session_id: id });
  if (!guest || guest.responsible_member_id.toString() !== member._id.toString()) {
    return NextResponse.json({ error: "Không tìm thấy khách vãng lai" }, { status: 404 });
  }

  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });
  const lockError = assertGuestEditable(session);
  if (lockError) return NextResponse.json({ error: lockError }, { status: 400 });

  guest.guest_name = guestName || undefined;
  guest.quantity = quantity;
  await guest.save();

  const settings = await getSettings();
  const { detail, costUnits } = await announceAttendanceChange(session, settings, () => [
    `✏️ <b>${member.full_name}</b> đã sửa khách vãng lai <b>${guestName || "(không tên)"}</b> × ${quantity}.`,
  ]);

  const myGuests = await getMemberGuests(id, member._id.toString());
  return NextResponse.json({
    ...detail,
    totalUnits: costUnits.totalUnits,
    viewerMemberId: member._id.toString(),
    myGuests,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> }
) {
  const member = await requireActiveMember();
  if (!member) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id, guestId } = await params;
  await connectDB();

  const guest = await SessionGuest.findOne({ _id: guestId, session_id: id });
  if (!guest || guest.responsible_member_id.toString() !== member._id.toString()) {
    return NextResponse.json({ error: "Không tìm thấy khách vãng lai" }, { status: 404 });
  }

  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });
  const lockError = assertGuestEditable(session);
  if (lockError) return NextResponse.json({ error: lockError }, { status: 400 });

  const guestName = guest.guest_name;
  const quantity = guest.quantity;
  await guest.deleteOne();

  const settings = await getSettings();
  const { detail, costUnits } = await announceAttendanceChange(session, settings, () => [
    `🗑️ <b>${member.full_name}</b> đã xoá khách vãng lai <b>${guestName || "(không tên)"}</b> × ${quantity}.`,
  ]);

  const myGuests = await getMemberGuests(id, member._id.toString());
  return NextResponse.json({
    ...detail,
    totalUnits: costUnits.totalUnits,
    viewerMemberId: member._id.toString(),
    myGuests,
  });
}
