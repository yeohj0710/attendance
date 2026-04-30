"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, getDeviceFingerprint, getDeviceId, storeToken } from "@/components/api";
import { Spinner } from "@/components/Spinner";

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

type NetworkResponse = {
  detectedIp: string | null;
  isOfficeIp: boolean;
  isDesktop: boolean;
};

export function LoginPanel({
  onLogin,
}: {
  onLogin: (employee?: Extract<LoginResponse, { ok: true }>["employee"]) => void;
}) {
  const [employeeName, setEmployeeName] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<NetworkResponse>("/api/network")
      .then((result) => setNetwork(result))
      .catch(() => undefined)
      .finally(() => setIsCheckingNetwork(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (network && (!network.isOfficeIp || !network.isDesktop)) {
      setMessage(getNetworkMessage(network));
      return;
    }

    if (pin !== pinConfirm) {
      setMessage("PIN이 서로 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const loginDeviceId = getDeviceId(employeeName);
      const result = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          employeeName,
          pin,
          pinConfirm,
          deviceId: loginDeviceId,
          deviceFingerprint: await getDeviceFingerprint(),
        }),
      });

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      storeToken(result.token, loginDeviceId);
      onLogin(result.employee);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const networkMessage = network ? getNetworkMessage(network) : "";
  const isNetworkBlocked = Boolean(networkMessage);

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-6">
      <form
        onSubmit={handleSubmit}
        className="w-full rounded-lg border border-line bg-white/95 p-6 shadow-panel"
      >
        <div className="mb-5">
          <img
            alt="웰니스박스"
            className="mb-4 h-8 w-auto"
            height={32}
            src="/brand/wellnessbox-logo.png"
            width={160}
          />
          <h1 className="text-xl font-bold text-ink">웰니스박스 출퇴근기록부</h1>
          <p className="mt-1 text-sm text-muted">
            처음 한 번만 확인하면, 이 컴퓨터에서는 편하게 기록할 수 있어요.
          </p>
        </div>

        {isCheckingNetwork ? (
          <div className="rounded border border-line bg-field/80 px-3 py-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2">
              <Spinner />
              접속 환경을 확인하고 있어요.
            </span>
          </div>
        ) : isNetworkBlocked ? (
          <div className="rounded border border-warn/30 bg-warn/10 px-3 py-4 text-sm leading-6 text-warn">
            <p className="font-semibold">회사 네트워크 전용 페이지입니다.</p>
            <p className="mt-1">{networkMessage}</p>
          </div>
        ) : (
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

            <label className="block">
              <span className="label">4자리 PIN 한 번 더</span>
              <input
                className="field mt-1"
                value={pinConfirm}
                onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))}
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
              />
            </label>
          </div>
        )}

        {message ? (
          <p className="mt-4 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {message}
          </p>
        ) : null}

        <button
          className="primary-button mt-5 w-full"
          disabled={isSubmitting || isCheckingNetwork || isNetworkBlocked}
          type="submit"
        >
          {isSubmitting ? (
            <>
              <Spinner className="mr-2" />
              확인 중
            </>
          ) : (
              "시작하기"
          )}
        </button>
      </form>
    </section>
  );
}

function getNetworkMessage(network: NetworkResponse) {
  if (!network.isDesktop) {
    return "출퇴근 기록은 회사 컴퓨터에서만 사용할 수 있어요. 모바일이나 태블릿에서는 로그인이 차단됩니다.";
  }

  if (!network.isOfficeIp) {
    return "회사 네트워크에 연결된 상태에서만 출퇴근 체크를 사용할 수 있어요. 회사 Wi-Fi나 유선 LAN에 연결한 뒤 다시 시도해주세요.";
  }

  return "";
}
