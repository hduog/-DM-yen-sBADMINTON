"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AuthState = "checking" | "join-required" | "login-fallback";
type JoinKind = "member" | "admin";
type JoinState = "idle" | "sending" | "sent" | "error";
type LoginState = "idle" | "sending" | "error";

const JOIN_SENT_MESSAGE: Record<JoinKind, string> = {
  member: "Đã ghi nhận. Bạn sẽ được xác nhận thành viên rồi mở lại app.",
  admin: "Đã gửi yêu cầu. Vui lòng chờ được cấp quyền admin rồi mở lại app.",
};

type TelegramWebApp = NonNullable<Window["Telegram"]>["WebApp"];

function redirectAfterLogin(
  router: ReturnType<typeof useRouter>,
  role: string | undefined,
  webApp: TelegramWebApp | undefined
) {
  const startParam = webApp?.initDataUnsafe?.start_param;
  const sessionMatch = startParam?.match(/^session_([0-9a-f]{24})$/);
  if (sessionMatch) {
    router.replace(`/attend/${sessionMatch[1]}`);
  } else if (role === "admin") {
    router.replace("/dashboard");
  } else {
    router.replace("/attend");
  }
}

export default function AppEntry() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [initData, setInitData] = useState("");
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [joinKind, setJoinKind] = useState<JoinKind | null>(null);
  const [joinError, setJoinError] = useState("");

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginState, setLoginState] = useState<LoginState>("idle");
  const [loginError, setLoginError] = useState("");

  const [showManualLoginButton, setShowManualLoginButton] = useState(false);
  const [manualLoginRequested, setManualLoginRequested] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowManualLoginButton(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function authenticate() {
      // 1) Đã có session hợp lệ (cookie clb_session còn hạn 30 ngày) thì dùng luôn, không cần
      // re-verify Telegram initData mỗi lần mở app.
      try {
        const meRes = await fetch("/api/me");
        if (meRes.ok) {
          const me = await meRes.json();
          redirectAfterLogin(router, me.role, window.Telegram?.WebApp);
          return;
        }
      } catch {
        // Lỗi mạng khi check session — vẫn thử tiếp bằng Telegram bên dưới.
      }

      // 2) Chưa có session hợp lệ -> thử đăng nhập qua Telegram initData. Toàn bộ nhánh này được
      // try/catch để không bao giờ mắc kẹt ở màn hình "checking" dù lỗi ở bất kỳ bước nào.
      try {
        const webApp = window.Telegram?.WebApp;
        if (!webApp) {
          setState("login-fallback");
          setFallbackMessage(
            "Vui lòng mở ứng dụng này từ Telegram, hoặc đăng nhập bằng tài khoản bên dưới."
          );
          return;
        }

        webApp.ready();
        webApp.expand();

        const data = webApp.initData;
        if (!data) {
          setState("login-fallback");
          setFallbackMessage(
            "Không lấy được dữ liệu đăng nhập từ Telegram. Vui lòng đăng nhập bằng tài khoản bên dưới."
          );
          return;
        }
        setInitData(data);

        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: data }),
        });
        const resData = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (res.status === 403) {
            setState("join-required");
            setFallbackMessage(resData.error ?? "Bạn không có quyền truy cập Mini App này");
          } else {
            setState("login-fallback");
            setFallbackMessage(resData.error ?? "Đăng nhập Telegram thất bại");
          }
          return;
        }

        redirectAfterLogin(router, resData.member?.role, webApp);
      } catch (err) {
        setState("login-fallback");
        setFallbackMessage(err instanceof Error ? err.message : "Đăng nhập thất bại");
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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginState("sending");
    setLoginError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Đăng nhập thất bại");
      }
      redirectAfterLogin(router, data.member?.role, window.Telegram?.WebApp);
    } catch (err) {
      setLoginState("error");
      setLoginError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    }
  }

  const loginForm = (
    <form onSubmit={handleLogin} className="mt-6 flex w-full max-w-xs flex-col gap-2 text-left">
      <p className="text-xs font-medium text-zinc-400">Đăng nhập bằng tài khoản</p>
      <input
        type="text"
        required
        placeholder="Tài khoản"
        value={loginUsername}
        onChange={(e) => setLoginUsername(e.target.value)}
        className="rounded border border-zinc-300 px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        placeholder="Mật khẩu"
        value={loginPassword}
        onChange={(e) => setLoginPassword(e.target.value)}
        className="rounded border border-zinc-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={loginState === "sending"}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loginState === "sending" ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
      {loginState === "error" && <p className="text-sm text-red-500">{loginError}</p>}
      <Link href="/register" className="mt-1 text-center text-xs text-zinc-500 underline">
        Chưa có tài khoản? Đăng ký
      </Link>
    </form>
  );

  if (state === "checking" && manualLoginRequested) {
    return (
      <Centered>
        <p className="text-zinc-600">Đăng nhập thủ công</p>
        {loginForm}
        <button
          type="button"
          onClick={() => setManualLoginRequested(false)}
          className="mt-3 text-xs text-zinc-400 underline"
        >
          Quay lại chờ đăng nhập Telegram
        </button>
      </Centered>
    );
  }

  if (state === "login-fallback") {
    return (
      <Centered>
        <p className="text-zinc-600">{fallbackMessage}</p>
        {loginForm}
      </Centered>
    );
  }

  if (state === "join-required") {
    return (
      <Centered>
        <p className="font-medium text-red-600">{fallbackMessage}</p>
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
      {showManualLoginButton && (
        <button
          type="button"
          onClick={() => setManualLoginRequested(true)}
          className="mt-4 text-sm text-zinc-500 underline"
        >
          Đăng nhập thủ công
        </button>
      )}
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
