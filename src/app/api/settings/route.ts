import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSettings } from "@/lib/models/Settings";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  await connectDB();
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });

  await connectDB();
  const settings = await getSettings();

  const editableFields = [
    "club_name",
    "main_group_chat_id",
    "admin_group_chat_id",
    "weekly_schedule",
    "reminder_hours_before",
    "cost_survey_minutes_after",
    "monthly_settlement_day",
  ] as const;

  for (const field of editableFields) {
    if (field in body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (settings as any)[field] = body[field];
    }
  }

  await settings.save();
  return NextResponse.json(settings);
}
