"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AuthState = "checking" | "error" | "not-telegram";
type JoinKind = "member" | "admin";
type JoinState = "idle" | "sending" | "sent" | "error";
type AdminLoginState = "idle" | "sending" | "error";

const JOIN_SENT_MESSAGE: Record<JoinKind, string> = {
  member: "Đã ghi nhận. Bạn sẽ được xác nhận thành viên rồi mở lại app.",
  admin: "Đã gửi yêu cầu. Vui lòng chờ được cấp quyền admin rồi mở lại app.",
};

export default function AppEntry() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [initData, setInitData] = useState("");
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [joinKind, setJoinKind] = useState<JoinKind | null>(null);
  const [joinError, setJoinError] = useState("");

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginState, setAdminLoginState] = useState<AdminLoginState>("idle");
  const [adminLoginError, setAdminLoginError] = useState("");

  useEffect(() => {
    async function authenticate() {
      const webApp = window.Telegram?.WebApp;
      if (!webApp) {
        setState("not-telegram");
        return;
      }

      webApp.ready();
      webApp.expand();

      const data = webApp.initData;
      if (!data) {
        setState("not-telegram");
        return;
      }
      setInitData(data);

      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: data }),
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resData.error ?? "Đăng nhập thất bại");
        }

        const startParam = webApp.initDataUnsafe?.start_param;
        const sessionMatch = startParam?.match(/^session_([0-9a-f]{24})$/);
        if (sessionMatch) {
          router.replace(`/attend/${sessionMatch[1]}`);
        } else if (resData.member?.role === "admin") {
          router.replace("/dashboard");
        } else {
          router.replace("/attend");
        }
      } catch (err) {
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : "Đăng nhập thất bại");
      }
    }

    void authenticate();
  }, [router]);

  async function handleJoin(kind: JoinKind) {
    if (!initData || joinState === "sending") return;

    setJoinState("sending");
    setJoinKind(kind);
    setJoinError("");

    try {
      const res = await fetch("/api/auth/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Gửi yêu cầu thất bại");
      }
      setJoinState("sent");
    } catch (err) {
      setJoinState("error");
      setJoinError(err instanceof Error ? err.message : "Gửi yêu cầu thất bại");
    }
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setAdminLoginState("sending");
    setAdminLoginError("");

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Đăng nhập thất bại");
      }
      router.replace("/dashboard");
    } catch (err) {
      setAdminLoginState("error");
      setAdminLoginError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    }
  }

  if (state === "not-telegram") {
    return (
      <Centered>
        <p className="text-zinc-600">
          Vui lòng mở ứng dụng này từ Telegram (qua nút Menu của bot) để đăng nhập.
        </p>

        <form onSubmit={handleAdminLogin} className="mt-6 flex w-full max-w-xs flex-col gap-2 text-left">
          <p className="text-xs font-medium text-zinc-400">Hoặc đăng nhập bằng tài khoản admin</p>
          <input
            type="email"
            required
            placeholder="Email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            placeholder="Mật khẩu"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={adminLoginState === "sending"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {adminLoginState === "sending" ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
          {adminLoginState === "error" && (
            <p className="text-sm text-red-500">{adminLoginError}</p>
          )}
        </form>
      </Centered>
    );
  }

  if (state === "error") {
    return (
      <Centered>
        <p className="font-medium text-red-600">{errorMessage}</p>
        <p className="mt-2 text-sm text-zinc-500">
          Nếu bạn là quản trị viên CLB, hãy liên hệ để được thêm vào danh sách admin.
        </p>

        {joinState === "sent" ? (
          <p className="mt-4 text-sm font-medium text-emerald-600">
            {JOIN_SENT_MESSAGE[joinKind ?? "member"]}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleJoin("member")}
              disabled={!initData || joinState === "sending"}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50"
            >
              {joinState === "sending" && joinKind === "member"
                ? "Đang gửi..."
                : "Tham gia với tư cách thành viên"}
            </button>
            <button
              type="button"
              onClick={() => handleJoin("admin")}
              disabled={!initData || joinState === "sending"}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {joinState === "sending" && joinKind === "admin" ? "Đang gửi..." : "Gửi yêu cầu làm admin"}
            </button>
          </div>
        )}

        {joinState === "error" && <p className="mt-2 text-sm text-red-500">{joinError}</p>}
      </Centered>
    );
  }

  return (
    <Centered>
      <p className="text-zinc-500">Đang đăng nhập...</p>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
