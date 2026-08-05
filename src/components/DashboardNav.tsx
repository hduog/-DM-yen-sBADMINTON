"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Tổng quan" },
  { href: "/dashboard/attendance", label: "Điểm danh" },
  { href: "/dashboard/statements", label: "Sao kê" },
  { href: "/dashboard/recruit", label: "Tuyển vãng lai" },
  { href: "/dashboard/settings", label: "Cấu hình" },
];

export function DashboardNav({ fullName }: { fullName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-zinc-500">Xin chào, {fullName}</span>
        <button onClick={handleLogout} className="text-sm text-zinc-400 hover:text-zinc-700">
          Đăng xuất
        </button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
