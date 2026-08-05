"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AuthState = "checking" | "error" | "not-telegram";

export default function AppEntry() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function authenticate() {
      const webApp = window.Telegram?.WebApp;
      if (!webApp) {
        setState("not-telegram");
        return;
      }

      webApp.ready();
      webApp.expand();

      const initData = webApp.initData;
      if (!initData) {
        setState("not-telegram");
        return;
      }

      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Đăng nhập thất bại");
        }
        router.replace("/dashboard");
      } catch (err) {
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : "Đăng nhập thất bại");
      }
    }

    void authenticate();
  }, [router]);

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
