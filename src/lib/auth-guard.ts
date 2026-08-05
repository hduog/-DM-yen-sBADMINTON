import { cookies } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Member } from "@/lib/models";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Dùng trong các API route cần quyền admin (settings, sessions, item-configs...).
export async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return null;

  await connectDB();
  const member = await Member.findById(session.memberId);
  if (!member || member.role !== "admin" || member.status !== "active") return null;

  return member;
}
