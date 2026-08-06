import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Attendance, Member, MemberAdvance, MonthlyStatement, Session, SessionMemberCost } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword } from "@/lib/password";
import { vnNow } from "@/lib/session-actions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const member = await Member.findOne({ _id: id, del_flag: { $ne: true } });
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên" }, { status: 404 });
  const hasPassword = await Member.exists({ _id: id, password_hash: { $exists: true } });

  const now = vnNow();
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(searchParams.get("month")) || now.getUTCMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  const sessionsInMonth = await Session.find({ date: { $gte: monthStart, $lt: monthEnd } }).select("_id");
  const sessionsAttended = await Attendance.countDocuments({
    member_id: id,
    session_id: { $in: sessionsInMonth.map((s) => s._id) },
    answer: "present",
  });

  // Breakdown chi phí từng buổi tập trong tháng đang xem — chỉ hiển thị (không chỉnh sửa được),
  // dữ liệu lấy từ SessionMemberCost ghi tại thời điểm quyết toán (settleSessionCost).
  const memberSessionCosts = await SessionMemberCost.find({
    member_id: id,
    session_id: { $in: sessionsInMonth.map((s) => s._id) },
  }).populate("session_id", "date start_time end_time status");

  const sessionCosts = memberSessionCosts
    .map((c) => ({
      session: c.session_id as unknown as {
        _id: string;
        date: Date;
        start_time: string;
        end_time: string;
        status: string;
      },
      amount: c.amount,
      units: c.units,
    }))
    .sort((a, b) => new Date(a.session.date).getTime() - new Date(b.session.date).getTime());

  const statements = await MonthlyStatement.find({ member_id: id }).sort({ month: -1 });
  const advances = await MemberAdvance.find({ member_id: id }).sort({ month: -1, createdAt: -1 });

  return NextResponse.json({
    member: { ...member.toObject(), has_password: Boolean(hasPassword) },
    monthKey,
    sessionsAttended,
    sessionCosts,
    statements,
    advances,
  });
}

// Sửa các trường có thể chỉnh tay từ trang chi tiết thành viên: group chat riêng dùng gửi noti sao
// kê, và tài khoản đăng nhập fallback (username/password) — xem /api/auth/login.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });

  await connectDB();
  const member = await Member.findById(id);
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên" }, { status: 404 });

  if ("statement_chat_id" in body) {
    const value = body.statement_chat_id;
    member.statement_chat_id = value === null || value === "" ? undefined : Number(value);
  }

  if ("username" in body) {
    const value = typeof body.username === "string" ? body.username.trim() : "";
    member.username = value === "" ? undefined : value;
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: "Mật khẩu cần tối thiểu 6 ký tự" }, { status: 400 });
    }
    member.password_hash = await hashPassword(body.password);
  }

  try {
    await member.save();
  } catch {
    return NextResponse.json({ error: "Tài khoản đăng nhập này đã được dùng cho member khác" }, { status: 409 });
  }

  const responseMember = member.toObject();
  const hadPassword = "password_hash" in responseMember;
  delete responseMember.password_hash;
  return NextResponse.json({ ...responseMember, has_password: hadPassword });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  if (id === admin._id.toString()) {
    return NextResponse.json({ error: "Không thể tự hủy chính mình" }, { status: 400 });
  }

  const member = await Member.findById(id);
  if (!member) return NextResponse.json({ error: "Không tìm thấy thành viên" }, { status: 404 });

  member.del_flag = true;
  member.status = "inactive";
  await member.save();

  return NextResponse.json({ ok: true });
}
