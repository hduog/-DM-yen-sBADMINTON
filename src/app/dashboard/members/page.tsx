"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MemberItem = {
  _id: string;
  telegram_id: number;
  full_name: string;
  username?: string;
  role: "admin" | "member";
  status: "active" | "inactive";
  joined_at: string;
};

const ROLE_LABEL: Record<MemberItem["role"], string> = {
  admin: "Admin",
  member: "Thành viên",
};

export default function MembersPage() {
  const [members, setMembers] = useState<MemberItem[] | null>(null);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then(setMembers);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {members === null && <p className="text-sm text-zinc-400">Đang tải...</p>}
      {members?.length === 0 && <p className="text-sm text-zinc-400">Chưa có thành viên nào.</p>}
      {members?.map((m) => (
        <Link
          key={m._id}
          href={`/dashboard/members/${m._id}`}
          className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-4"
        >
          <div>
            <p className="font-medium">{m.full_name}</p>
            <p className="text-xs text-zinc-500">
              {m.username ? `@${m.username} · ` : ""}ID {m.telegram_id} · Tham gia{" "}
              {new Date(m.joined_at).toLocaleDateString("vi-VN")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                m.role === "admin" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {ROLE_LABEL[m.role]}
            </span>
            {m.status === "inactive" && (
              <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-600">
                Ngừng hoạt động
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
