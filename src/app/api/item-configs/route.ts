import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { ItemConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await connectDB();
  const items = await ItemConfig.find().sort({ name: 1 });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.unit_price || !body?.unit) {
    return NextResponse.json({ error: "Thiếu thông tin vật phẩm" }, { status: 400 });
  }

  await connectDB();
  const item = await ItemConfig.create({
    name: body.name,
    unit_price: Number(body.unit_price),
    unit: body.unit,
  });

  return NextResponse.json(item, { status: 201 });
}
