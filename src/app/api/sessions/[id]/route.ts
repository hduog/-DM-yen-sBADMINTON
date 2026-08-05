import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || (body.notes === undefined && body.status === undefined)) {
    return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });
  }
  if (body.status !== undefined && body.status !== "cancelled") {
    return NextResponse.json({ error: "Chỉ hỗ trợ hủy buổi tập qua API này" }, { status: 400 });
  }

  await connectDB();
  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });

  if (body.notes !== undefined) session.notes = body.notes;
  if (body.status !== undefined) session.status = body.status;
  await session.save();

  return NextResponse.json(session);
}
