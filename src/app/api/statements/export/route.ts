import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth-guard";
import { buildMonthlyStatementCsv } from "@/lib/statement-export";
import { sendDocument } from "@/lib/telegram";

function parseMonth(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

// GET: tải file CSV sao kê tháng (dùng khi mở dashboard trên trình duyệt).
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const target = parseMonth(request);
  if (!target) return NextResponse.json({ error: "Cần chọn tháng và năm" }, { status: 400 });

  await connectDB();
  const { csv, fileName } = await buildMonthlyStatementCsv(target.year, target.month);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

// POST: bot gửi file CSV vào chat riêng của admin — dùng trong Telegram Mini App, nơi webview
// thường chặn tải file trực tiếp.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const target = parseMonth(request);
  if (!target) return NextResponse.json({ error: "Cần chọn tháng và năm" }, { status: 400 });

  await connectDB();
  const { csv, fileName, rowCount, teamTotal } = await buildMonthlyStatementCsv(target.year, target.month);

  try {
    await sendDocument(
      admin.telegram_id,
      csv,
      fileName,
      `📊 Sao kê tháng ${String(target.month).padStart(2, "0")}/${target.year}: ${rowCount} dòng, tổng cả đội <b>${teamTotal.toLocaleString("vi-VN")}đ</b>`
    );
  } catch (err) {
    console.error("[statements-export] sendDocument failed:", err);
    return NextResponse.json(
      { error: "Bot không gửi được file — hãy nhắn /start cho bot ở chat riêng rồi thử lại" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
