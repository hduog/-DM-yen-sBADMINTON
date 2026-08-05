import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { ItemConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();
  await ItemConfig.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
