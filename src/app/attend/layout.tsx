import { redirect } from "next/navigation";
import { requireActiveMember } from "@/lib/auth-guard";

// Cho phép cả admin lẫn member thường (khác /dashboard chỉ admin) — dùng cho trang điểm danh
// buổi tập mà thành viên tự vào qua link bot gửi trong nhóm.
export default async function AttendLayout({ children }: { children: React.ReactNode }) {
  const member = await requireActiveMember();
  if (!member) redirect("/");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <span className="text-sm text-zinc-500">Xin chào, {member.full_name}</span>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
