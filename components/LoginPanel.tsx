"use client";

import { FormEvent, useState } from "react";
import { apiFetch, getDeviceId, storeToken } from "@/components/api";

type LoginResponse =
  | {
      ok: true;
      token: string;
      employee: {
        id: string;
        employeeNo: string;
        name: string;
        role: "employee" | "admin";
      };
    }
  | {
      ok: false;
      requiresDeviceApproval: true;
      message: string;
    };

export function LoginPanel({
  onLogin,
}: {
  onLogin: () => void;
}) {
  const [employeeName, setEmployeeName] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const result = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          employeeName,
          pin,
          deviceId: getDeviceId(),
        }),
      });

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      storeToken(result.token);
      onLogin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-6">
      <form
        onSubmit={handleSubmit}
        className="w-full rounded-lg border border-line bg-white p-5 shadow-panel"
      >
        <div className="mb-5">
          <h1 className="text-xl font-bold text-ink">출퇴근 체크</h1>
          <p className="mt-1 text-sm text-muted">
            처음 한 번만 이름과 PIN으로 이 회사 컴퓨터를 등록합니다.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="label">이름</span>
            <input
              className="field mt-1"
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="block">
            <span className="label">4자리 PIN</span>
            <input
              className="field mt-1"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
            />
          </label>
        </div>

        {message ? (
          <p className="mt-4 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {message}
          </p>
        ) : null}

        <button
          className="primary-button mt-5 w-full"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "확인 중" : "로그인"}
        </button>
      </form>
    </section>
  );
}
