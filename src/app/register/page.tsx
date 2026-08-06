"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type RegisterState = "idle" | "sending" | "error";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<RegisterState>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Đăng ký thất bại");
      }
      router.replace("/attend");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Đăng ký thất bại");
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="text-lg font-semibold text-zinc-900">Đăng ký tài khoản thành viên</p>
      <p className="mt-1 text-sm text-zinc-500">
        Dùng để đăng nhập điểm danh khi không mở được từ Telegram.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex w-full max-w-xs flex-col gap-2 text-left">
        <input
          type="text"
          required
          placeholder="Họ và tên"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          required
          placeholder="Tài khoản đăng nhập"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          placeholder="Mật khẩu (tối thiểu 6 ký tự)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "sending" ? "Đang đăng ký..." : "Đăng ký"}
        </button>
        {state === "error" && <p className="text-sm text-red-500">{error}</p>}
      </form>

      <Link href="/" className="mt-4 text-sm text-zinc-500 underline">
        Đã có tài khoản? Đăng nhập
      </Link>
    </div>
  );
}
