import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guard";

// Chỉ admin truy cập được (khác /attend cho phép cả member) — trang quyết toán mở qua link nhắc
// quyết toán gửi vào nhóm quản trị.
export default async function SettleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <span className="text-sm text-zinc-500">Quyết toán buổi tập</span>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
