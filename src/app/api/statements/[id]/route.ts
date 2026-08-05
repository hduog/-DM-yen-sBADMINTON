import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { MonthlyStatement } from "@/lib/models";
import { requireAdmin } from "@/lib/auth-guard";

// Cho phép admin chỉnh tay sao kê của 1 tháng cụ thể (VD: tính sai chi phí) từ trang chi tiết thành viên.
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
  const statement = await MonthlyStatement.findById(id);
  if (!statement) return NextResponse.json({ error: "Không tìm thấy sao kê" }, { status: 404 });

  const editableFields = ["total_sessions", "total_amount", "status"] as const;
  for (const field of editableFields) {
    if (field in body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (statement as any)[field] = body[field];
    }
  }

  await statement.save();
  return NextResponse.json(statement);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  await connectDB();
  await MonthlyStatement.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
