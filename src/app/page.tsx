"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AuthState = "checking" | "error" | "not-telegram";
type RequestAdminState = "idle" | "sending" | "sent" | "error";

export default function AppEntry() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [initData, setInitData] = useState("");
  const [requestAdminState, setRequestAdminState] = useState<RequestAdminState>("idle");
  const [requestAdminError, setRequestAdminError] = useState("");

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
        if (!res.ok) {
          const resData = await res.json().catch(() => ({}));
          throw new Error(resData.error ?? "Đăng nhập thất bại");
        }
        router.replace("/dashboard");
      } catch (err) {
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : "Đăng nhập thất bại");
      }
    }

    void authenticate();
  }, [router]);

  async function handleRequestAdmin() {
    if (!initData || requestAdminState === "sending") return;

    setRequestAdminState("sending");
    setRequestAdminError("");

    try {
      const res = await fetch("/api/auth/request-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Gửi yêu cầu thất bại");
      }
      setRequestAdminState("sent");
    } catch (err) {
      setRequestAdminState("error");
      setRequestAdminError(err instanceof Error ? err.message : "Gửi yêu cầu thất bại");
    }
  }

  if (state === "not-telegram") {
    return (
      <Centered>
        <p className="text-zinc-600">
          Vui lòng mở ứng dụng này từ Telegram (qua nút Menu của bot) để đăng nhập.
        </p>
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

        {requestAdminState === "sent" ? (
          <p className="mt-4 text-sm font-medium text-emerald-600">
            Đã gửi yêu cầu. Vui lòng chờ được cấp quyền admin rồi mở lại app.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleRequestAdmin}
            disabled={!initData || requestAdminState === "sending"}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {requestAdminState === "sending" ? "Đang gửi..." : "Gửi yêu cầu làm admin"}
          </button>
        )}

        {requestAdminState === "error" && (
          <p className="mt-2 text-sm text-red-500">{requestAdminError}</p>
        )}
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
