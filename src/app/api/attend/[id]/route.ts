import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireActiveMember } from "@/lib/auth-guard";
import {
  combineVNDateTime,
  getMemberGuests,
  getSessionAttendanceDetail,
  getSessionCostUnits,
  recordAttendanceVote,
} from "@/lib/session-actions";

// Dùng bởi trang /attend/[id] — thay cho vote qua Telegram poll. Cho phép cả admin lẫn member
// thường (requireActiveMember), không phải requireAdmin.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await requireActiveMember();
  if (!member) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });

  const [detail, { totalUnits }, myGuests] = await Promise.all([
    getSessionAttendanceDetail(id),
    getSessionCostUnits(id),
    getMemberGuests(id, member._id.toString()),
  ]);
  return NextResponse.json({
    session: {
      _id: session._id,
      date: session.date,
      start_time: session.start_time,
      end_time: session.end_time,
      min_required: session.min_required,
      status: session.status,
    },
    ...detail,
    totalUnits,
    viewerMemberId: member._id.toString(),
    myGuests,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await requireActiveMember();
  if (!member) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const answer = body?.answer;
  if (answer !== "present" && answer !== "absent") {
    return NextResponse.json({ error: "Lựa chọn không hợp lệ" }, { status: 400 });
  }

  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (answer === "absent" && !reason) {
    return NextResponse.json({ error: "Vui lòng nhập lý do không tham gia" }, { status: 400 });
  }

  await connectDB();
  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });
  if (session.status === "cancelled") {
    return NextResponse.json({ error: "Buổi tập đã bị huỷ, không thể điểm danh" }, { status: 400 });
  }
  const startAt = combineVNDateTime(session.date, session.start_time);
  if (new Date() >= startAt) {
    return NextResponse.json(
      { error: "Đã quá giờ, buổi tập đã bắt đầu nên không thể điểm danh nữa" },
      { status: 400 }
    );
  }

  const settings = await getSettings();
  const detail = await recordAttendanceVote(session, member, answer, reason || undefined, settings);

  return NextResponse.json({ ...detail, viewerMemberId: member._id.toString() });
}
