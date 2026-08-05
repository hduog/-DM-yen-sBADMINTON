import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await connectDB();
  const sessions = await Session.find().sort({ date: -1, start_time: -1 }).limit(50);
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
