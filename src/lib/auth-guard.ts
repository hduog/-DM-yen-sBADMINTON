import { cookies } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Member } from "@/lib/models";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Dùng cho các trang/API chỉ cần đã đăng nhập + còn active (VD: trang điểm danh /attend/[id] —
// cả admin lẫn member thường đều truy cập được).
export async function requireActiveMember() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return null;

  await connectDB();
  const member = await Member.findById(session.memberId);
  if (!member || member.status !== "active" || member.del_flag) return null;

  return member;
}

// Dùng trong các API route cần quyền admin (settings, sessions, item-configs...).
export async function requireAdmin() {
  const member = await requireActiveMember();
  if (!member || member.role !== "admin") return null;
  return member;
}
