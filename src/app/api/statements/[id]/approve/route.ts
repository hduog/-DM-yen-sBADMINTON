import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Member, MonthlyStatement } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { sendMessage } from "@/lib/telegram";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const statement = await MonthlyStatement.findById(id);
  if (!statement) return NextResponse.json({ error: "Không tìm thấy sao kê" }, { status: 404 });

  statement.status = "approved";
  statement.approved_at = new Date();
  statement.approved_by = admin._id;
  await statement.save();

  const member = await Member.findById(statement.member_id);
  const settings = await getSettings();
  if (settings.main_group_chat_id && member) {
    await sendMessage(
      settings.main_group_chat_id,
      `✅ Thành viên <b>${member.full_name}</b> đã thanh toán xong tháng ${statement.month}.`
    );
  }

  return NextResponse.json(statement);
}
