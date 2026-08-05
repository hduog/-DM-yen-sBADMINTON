"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

const TABS: { href: string; label: string; icon: (active: boolean) => ReactNode }[] = [
  {
    href: "/dashboard",
    label: "Tổng quan",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.25 : 1.75} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5 12 4l9 7.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
      </svg>
    ),
  },
  {
    href: "/dashboard/members",
    label: "Thành viên",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.25 : 1.75} stroke="currentColor" className="h-5 w-5">
        <circle cx="9" cy="8" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 5.5a3 3 0 0 1 0 5.9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 14.6c2.4.5 4 2.2 4 4.9" />
      </svg>
    ),
  },
  {
    href: "/dashboard/attendance",
    label: "Điểm danh",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.25 : 1.75} stroke="currentColor" className="h-5 w-5">
        <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5 10.5 14.5 15.5 9.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/statements",
    label: "Sao kê",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.25 : 1.75} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 3.5h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5h6M9 14h6M9 17.5h3.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/recruit",
    label: "Vãng lai",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.25 : 1.75} stroke="currentColor" className="h-5 w-5">
        <circle cx="9.5" cy="8" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5c0-3 2.5-5 6-5s6 2 6 5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 8v5M16 10.5h5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Cấu hình",
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.25 : 1.75} stroke="currentColor" className="h-5 w-5">
        <circle cx="12" cy="12" r="3" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3.5v2.1M12 18.4v2.1M20.5 12h-2.1M5.6 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8 6.3 6.3"
        />
      </svg>
    ),
  },
];

export function DashboardNav({ fullName }: { fullName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <span className="text-sm text-zinc-500">Xin chào, {fullName}</span>
        <button
          onClick={handleLogout}
          aria-label="Đăng xuất"
          className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H9" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5 19 12l-3.5 3.5M19 12H9.5" />
          </svg>
        </button>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-screen-md items-stretch justify-between">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                {tab.icon(active)}
                <span className="leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
