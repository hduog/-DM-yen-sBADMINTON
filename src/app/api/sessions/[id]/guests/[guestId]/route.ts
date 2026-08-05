import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session, SessionGuest } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { announceAttendanceChange } from "@/lib/session-actions";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id, guestId } = await params;
  await connectDB();

  const guest = await SessionGuest.findOne({ _id: guestId, session_id: id }).populate(
    "responsible_member_id",
    "full_name"
  );
  if (!guest) {
    return NextResponse.json({ error: "Không tìm thấy khách vãng lai" }, { status: 404 });
  }

  const session = await Session.findById(id);
  if (session && (session.cost_settled_at || session.pass_court_at || session.status === "cancelled")) {
    return NextResponse.json({ error: "Buổi tập đã quyết toán hoặc đã huỷ, không thể chỉnh sửa" }, { status: 400 });
  }

  await guest.deleteOne();

  if (session) {
    const settings = await getSettings();
    const responsibleName =
      (guest.responsible_member_id as unknown as { full_name?: string } | null)?.full_name ?? "(đã xoá)";
    await announceAttendanceChange(session, settings, () => [
      `🗑️ <b>${admin.full_name}</b> đã xoá khách vãng lai <b>${guest.guest_name || "(không tên)"}</b> × ${guest.quantity} (người chịu trách nhiệm: <b>${responsibleName}</b>).`,
    ]);
  }

  return NextResponse.json({ ok: true });
}
