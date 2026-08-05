import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Attendance, ItemConfig, Session, SessionCost } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";
import { sendMessage } from "@/lib/telegram";
import { getSessionCostUnits } from "@/lib/session-actions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const [costs, items, presentCount, { totalUnits }, settings] = await Promise.all([
    SessionCost.find({ session_id: id }).populate("item_id", "name unit unit_price"),
    ItemConfig.find().sort({ name: 1 }),
    Attendance.countDocuments({ session_id: id, answer: "present" }),
    getSessionCostUnits(id),
    getSettings(),
  ]);

  const total = costs.reduce((sum, c) => sum + c.total_amount, 0) + (settings.fixed_cost_per_session ?? 0);

  return NextResponse.json({
    costs,
    items,
    presentCount,
    totalUnits,
    fixedCost: settings.fixed_cost_per_session ?? 0,
    total,
    perPerson: totalUnits > 0 ? Math.round(total / totalUnits) : 0,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.items)) {
    return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });
  }

  await connectDB();

  const session = await Session.findById(id);
  if (!session) return NextResponse.json({ error: "Không tìm thấy buổi tập" }, { status: 404 });
  if (session.cost_settled_at || session.pass_court_at || session.status === "cancelled") {
    return NextResponse.json({ error: "Buổi tập đã quyết toán hoặc đã huỷ, không thể chỉnh sửa" }, { status: 400 });
  }

  const settings = await getSettings();

  let total = settings.fixed_cost_per_session ?? 0;
  for (const entry of body.items as { item_id: string; quantity: number }[]) {
    const item = await ItemConfig.findById(entry.item_id);
    if (!item || !entry.quantity) continue;

    const total_amount = item.unit_price * entry.quantity;
    total += total_amount;

    await SessionCost.findOneAndUpdate(
      { session_id: id, item_id: entry.item_id },
      { session_id: id, item_id: entry.item_id, quantity: entry.quantity, total_amount },
      { upsert: true }
    );
  }

  const [presentCount, { totalUnits }] = await Promise.all([
    Attendance.countDocuments({ session_id: id, answer: "present" }),
    getSessionCostUnits(id),
  ]);
  const perPerson = totalUnits > 0 ? Math.round(total / totalUnits) : 0;

  if (settings.admin_group_chat_id) {
    await sendMessage(
      settings.admin_group_chat_id,
      `🧾 Chi phí buổi tập ${session.start_time}-${session.end_time} ngày ${session.date.toLocaleDateString("vi-VN")}: <b>${total.toLocaleString("vi-VN")}đ</b> (${totalUnits} suất, ${perPerson.toLocaleString("vi-VN")}đ/suất).`
    );
  }

  return NextResponse.json({ ok: true, total, perPerson, presentCount, totalUnits });
}
