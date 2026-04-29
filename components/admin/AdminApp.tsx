"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  clearToken,
  formatKstDateTime,
  getStoredAuth,
  type StoredAuth,
} from "@/components/api";
import { LoginPanel } from "@/components/LoginPanel";
import { Spinner } from "@/components/Spinner";

type Employee = {
  id: string;
  employeeNo: string;
  name: string;
  role: "employee" | "admin";
};

type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInIp: string | null;
  checkOutIp: string | null;
  checkInDeviceId: string | null;
  checkOutDeviceId: string | null;
  workType: WorkType;
  note: string | null;
};

type DeviceRequest = {
  id: string;
  employeeNo: string;
  employeeName: string;
  requestedAt: string;
  lastIp: string | null;
  deviceId: string;
};

type WorkType = "office" | "remote" | "offsite" | "business_trip";

type AttendanceForm = {
  id: string | null;
  employeeId: string;
  workDate: string;
  checkInAt: string;
  checkOutAt: string;
  workType: WorkType;
  note: string;
  reason: string;
};

const workTypeLabels: Record<WorkType, string> = {
  office: "사무실",
  remote: "재택",
  offsite: "외근",
  business_trip: "출장",
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export function AdminApp() {
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [unlockMessage, setUnlockMessage] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [admin, setAdmin] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRequest[]>([]);
  const [startDate, setStartDate] = useState(() => getMonthStart());
  const [endDate, setEndDate] = useState(() => getMonthEnd());
  const [employeeId, setEmployeeId] = useState("");
  const [form, setForm] = useState<AttendanceForm>(() => emptyForm());
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [approvingDeviceId, setApprovingDeviceId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (employeeId) params.set("employeeId", employeeId);
    return params.toString();
  }, [employeeId, endDate, startDate]);

  const monthlySummary = useMemo(
    () => buildMonthlySummary(employees, records, startDate, endDate),
    [employees, endDate, records, startDate],
  );
  const groupedRecords = useMemo(() => groupRecordsByEmployee(records), [records]);

  const load = useCallback(
    async (storedAuth: StoredAuth) => {
      setMessage("");
      setIsRefreshing(true);

      try {
        const me = await apiFetch<{ employee: Employee }>("/api/auth/me", {
          auth: storedAuth,
        });

        if (me.employee.role !== "admin") {
          throw new Error("관리자만 접근할 수 있습니다.");
        }

        const [employeesResult, recordsResult, devicesResult] = await Promise.all([
          apiFetch<{ employees: Employee[] }>("/api/admin/employees", {
            auth: storedAuth,
          }),
          apiFetch<{ records: AttendanceRecord[] }>(`/api/admin/attendance?${query}`, {
            auth: storedAuth,
          }),
          apiFetch<{ devices: DeviceRequest[] }>("/api/admin/devices", {
            auth: storedAuth,
          }),
        ]);

        setAdmin(me.employee);
        setEmployees(employeesResult.employees);
        setRecords(recordsResult.records);
        setDevices(devicesResult.devices);
      } finally {
        setIsRefreshing(false);
      }
    },
    [query],
  );

  useEffect(() => {
    setIsAdminUnlocked(sessionStorage.getItem("attendance.adminUnlocked") === "1");
  }, []);

  useEffect(() => {
    if (!isAdminUnlocked) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);

    if (!storedAuth) {
      setIsLoading(false);
      return;
    }

    load(storedAuth)
      .catch((error) => {
        setMessage(
          error instanceof Error
            ? error.message
            : "관리자 정보를 불러오지 못했습니다.",
        );
        clearToken();
        setAuth(null);
      })
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
      });
  }, [isAdminUnlocked, load]);

  async function unlockAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUnlockMessage("");
    setIsUnlocking(true);

    try {
      await apiFetch<{ ok: true }>("/api/admin/unlock", {
        method: "POST",
        body: JSON.stringify({ password: adminPassword }),
      });
      sessionStorage.setItem("attendance.adminUnlocked", "1");
      setIsAdminUnlocked(true);
    } catch (error) {
      setUnlockMessage(
        error instanceof Error ? error.message : "관리자 비밀번호를 확인하지 못했습니다.",
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  async function refresh() {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);
    if (!storedAuth) return;
    await load(storedAuth);
  }

  function setThisMonth() {
    setStartDate(getMonthStart());
    setEndDate(getMonthEnd());
  }

  async function submitAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;

    setMessage("");
    setIsMutating(true);

    try {
      const path = form.id
        ? `/api/admin/attendance/${form.id}`
        : "/api/admin/attendance";
      const method = form.id ? "PATCH" : "POST";

      await apiFetch(path, {
        method,
        auth,
        body: JSON.stringify({
          employeeId: form.employeeId,
          workDate: form.workDate,
          checkInAt: form.checkInAt || null,
          checkOutAt: form.checkOutAt || null,
          workType: form.workType,
          note: form.note || null,
          reason: form.reason || null,
        }),
      });

      setForm(emptyForm());
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      setIsMutating(false);
    }
  }

  async function approveDevice(id: string) {
    if (!auth) return;

    setIsMutating(true);
    setApprovingDeviceId(id);
    setMessage("");
    try {
      await apiFetch(`/api/admin/devices/${id}/approve`, {
        method: "POST",
        auth,
      });
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "기기 변경을 승인하지 못했습니다.",
      );
    } finally {
      setIsMutating(false);
      setApprovingDeviceId(null);
    }
  }

  async function downloadCsv() {
    if (!auth) return;

    setMessage("");
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/admin/attendance/export?${query}`, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "X-Attendance-Device": auth.deviceId,
        },
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "CSV를 내려받지 못했습니다.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "attendance.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CSV를 내려받지 못했습니다.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function logout() {
    if (auth) {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        auth,
      }).catch(() => undefined);
    }

    clearToken();
    sessionStorage.removeItem("attendance.adminUnlocked");
    setAuth(null);
    setAdmin(null);
    setIsAdminUnlocked(false);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          불러오는 중
        </span>
      </main>
    );
  }

  if (!isAdminUnlocked) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-6">
        <form
          className="w-full rounded-lg border border-line bg-white/95 p-6 shadow-panel"
          onSubmit={unlockAdmin}
        >
          <img
            alt="웰니스박스"
            className="mb-4 h-8 w-auto"
            height={32}
            src="/brand/wellnessbox-logo.png"
            width={160}
          />
          <h1 className="text-xl font-bold text-ink">관리자 확인</h1>
          <p className="mt-1 text-sm text-muted">
            관리자 페이지에 접근하려면 비밀번호를 입력하세요.
          </p>

          <label className="mt-5 block">
            <span className="label">관리자 비밀번호</span>
            <input
              autoComplete="current-password"
              className="field mt-1"
              inputMode="numeric"
              onChange={(event) => setAdminPassword(event.target.value)}
              type="password"
              value={adminPassword}
            />
          </label>

          {unlockMessage ? (
            <p className="mt-4 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
              {unlockMessage}
            </p>
          ) : null}

          <button
            className="primary-button mt-5 w-full"
            disabled={isUnlocking}
            type="submit"
          >
            {isUnlocking ? (
              <>
                <Spinner className="mr-2" />
                확인 중
              </>
            ) : (
              "확인"
            )}
          </button>
        </form>
      </main>
    );
  }

  if (!auth || !admin) {
    return <LoginPanel onLogin={refresh} />;
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-7xl px-4 py-5 sm:py-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <img
            alt="웰니스박스"
            className="mb-3 h-8 w-auto"
            height={32}
            src="/brand/wellnessbox-logo.png"
            width={160}
          />
          <p className="text-sm font-semibold text-muted">관리자</p>
          <h1 className="text-2xl font-bold text-ink">웰니스박스 출퇴근기록부</h1>
        </div>
        <button className="text-xs text-muted hover:text-ink" onClick={logout} type="button">
          이 기기 로그아웃
        </button>
      </header>

      {message ? (
        <p className="mb-4 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          {message}
        </p>
      ) : null}

      <section className="mb-4 rounded-lg border border-line bg-white/95 p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.3fr_auto_auto_auto]">
          <label>
            <span className="label">시작일</span>
            <input
              className="field mt-1"
              onChange={(event) => setStartDate(event.target.value)}
              type="date"
              value={startDate}
            />
          </label>
          <label>
            <span className="label">종료일</span>
            <input
              className="field mt-1"
              onChange={(event) => setEndDate(event.target.value)}
              type="date"
              value={endDate}
            />
          </label>
          <label>
            <span className="label">직원</span>
            <select
              className="field mt-1"
              onChange={(event) => setEmployeeId(event.target.value)}
              value={employeeId}
            >
              <option value="">전체</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {displayEmployee(employee)}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button self-end" onClick={setThisMonth} type="button">
            이번 달
          </button>
          <button
            className="secondary-button self-end"
            disabled={isRefreshing}
            onClick={refresh}
            type="button"
          >
            {isRefreshing ? (
              <>
                <Spinner className="mr-2" />
                조회 중
              </>
            ) : (
              "조회"
            )}
          </button>
          <button
            className="primary-button self-end"
            disabled={isDownloading}
            onClick={downloadCsv}
            type="button"
          >
            {isDownloading ? (
              <>
                <Spinner className="mr-2" />
                CSV
              </>
            ) : (
              "CSV"
            )}
          </button>
        </div>
      </section>

      {devices.length > 0 ? (
        <section className="mb-4 rounded-lg border border-line bg-white/95 p-4 shadow-panel">
          <h2 className="text-base font-bold text-ink">기기 변경 요청</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 pr-3">직원</th>
                  <th className="py-2 pr-3">요청시각</th>
                  <th className="py-2 pr-3">IP</th>
                  <th className="py-2 pr-3">기기</th>
                  <th className="py-2 text-right">처리</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 font-semibold">{displayEmployee(device)}</td>
                    <td className="py-2 pr-3">{formatKstDateTime(device.requestedAt)}</td>
                    <td className="py-2 pr-3">{device.lastIp ?? "-"}</td>
                    <td className="py-2 pr-3">{device.deviceId.slice(0, 8)}</td>
                    <td className="py-2 text-right">
                      <button
                        className="secondary-button px-3 py-1"
                        disabled={isMutating}
                        onClick={() => approveDevice(device.id)}
                        type="button"
                      >
                        {approvingDeviceId === device.id ? (
                          <>
                            <Spinner className="mr-2 h-3 w-3" />
                            승인 중
                          </>
                        ) : (
                          "승인"
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mb-4 rounded-lg border border-line bg-white/95 p-4 shadow-panel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink">직원별 월간 요약</h2>
          <span className="text-xs font-semibold text-muted">
            {isRefreshing ? (
              <span className="inline-flex items-center gap-1">
                <Spinner className="h-3 w-3" />
                갱신 중
              </span>
            ) : (
              `${startDate} ~ ${endDate}`
            )}
          </span>
        </div>
        <div className="max-h-[560px] overflow-auto pr-1">
          <div className="grid min-w-[340px] gap-3 md:grid-cols-2 xl:grid-cols-3">
            {monthlySummary.map((summary) => (
              <div key={summary.employee.id} className="rounded border border-line bg-field/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-ink">{displayEmployee(summary.employee)}</h3>
                    <p className="mt-1 text-xs text-muted">
                      기록 {summary.checkInDays}일 · 확인필요 {summary.openDays}건
                    </p>
                  </div>
                  <span className={summary.openDays ? "text-sm font-bold text-warn" : "text-sm font-bold text-accent"}>
                    {summary.openDays ? "확인필요" : "정상"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted">
                  {weekdayLabels.map((weekday) => (
                    <span key={weekday} className="py-1">
                      {weekday}
                    </span>
                  ))}
                </div>
                <div className="mt-1 max-h-72 overflow-y-auto pr-1">
                  <div className="grid grid-cols-7 gap-1">
                    {summary.days.map((day) => (
                      <span
                        key={day.date}
                        className={dayClassName(day.status)}
                        title={day.label ? `${day.date} ${day.label}` : undefined}
                      >
                        {day.day}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="rounded-lg border border-line bg-white/95 p-4 shadow-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">직원별 상세 기록</h2>
            {isRefreshing ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                <Spinner className="h-3 w-3" />
                갱신 중
              </span>
            ) : null}
          </div>
          <div className="space-y-5">
            {groupedRecords.map((group) => (
              <div key={group.employeeKey} className="overflow-hidden rounded border border-line">
                <div className="flex items-center justify-between gap-3 bg-field/90 px-3 py-2">
                  <h3 className="font-bold text-ink">{group.employeeName}</h3>
                  <span className="text-xs font-semibold text-muted">{group.records.length}건</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs text-muted">
                        <th className="py-2 pl-3 pr-3">날짜</th>
                        <th className="py-2 pr-3">상태</th>
                        <th className="py-2 pr-3">출근</th>
                        <th className="py-2 pr-3">퇴근</th>
                        <th className="py-2 pr-3">유형</th>
                        <th className="py-2 pr-3">IP</th>
                        <th className="py-2 pr-3">메모</th>
                        <th className="py-2 pr-3 text-right">수정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.records.map((record) => (
                        <tr key={record.id} className="border-b border-line last:border-0">
                          <td className="py-2 pl-3 pr-3 font-medium">{record.workDate}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge record={record} />
                          </td>
                          <td className="py-2 pr-3">{formatTimeOnly(record.checkInAt)}</td>
                          <td className="py-2 pr-3">{formatTimeOnly(record.checkOutAt)}</td>
                          <td className="py-2 pr-3">{workTypeLabels[record.workType]}</td>
                          <td className="py-2 pr-3 text-xs text-muted">
                            {formatIpPair(record.checkInIp, record.checkOutIp)}
                          </td>
                          <td className="max-w-48 truncate py-2 pr-3">{record.note ?? "-"}</td>
                          <td className="py-2 pr-3 text-right">
                            <button
                              className="text-sm font-semibold text-accent hover:underline"
                              onClick={() => setForm(formFromRecord(record))}
                              type="button"
                            >
                              수정
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {groupedRecords.length === 0 ? (
              <div className="rounded border border-line py-12 text-center text-sm text-muted">
                조회된 기록이 없습니다.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white/95 p-4 shadow-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">
              {form.id ? "기록 수정" : "기록 추가"}
            </h2>
            {form.id ? (
              <button
                className="text-xs text-muted hover:text-ink"
                onClick={() => setForm(emptyForm())}
                type="button"
              >
                취소
              </button>
            ) : null}
          </div>

          <form className="space-y-3" onSubmit={submitAttendance}>
            <label className="block">
              <span className="label">직원</span>
              <select
                className="field mt-1"
                onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
                value={form.employeeId}
              >
                <option value="">선택</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {displayEmployee(employee)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">근무일</span>
              <input
                className="field mt-1"
                onChange={(event) => setForm({ ...form, workDate: event.target.value })}
                type="date"
                value={form.workDate}
              />
            </label>

            <label className="block">
              <span className="label">출근시각</span>
              <input
                className="field mt-1"
                onChange={(event) => setForm({ ...form, checkInAt: event.target.value })}
                type="datetime-local"
                value={form.checkInAt}
              />
            </label>

            <label className="block">
              <span className="label">퇴근시각</span>
              <input
                className="field mt-1"
                onChange={(event) => setForm({ ...form, checkOutAt: event.target.value })}
                type="datetime-local"
                value={form.checkOutAt}
              />
            </label>

            <label className="block">
              <span className="label">근무 유형</span>
              <select
                className="field mt-1"
                onChange={(event) =>
                  setForm({ ...form, workType: event.target.value as WorkType })
                }
                value={form.workType}
              >
                {Object.entries(workTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">메모</span>
              <textarea
                className="field mt-1 min-h-20 resize-y"
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                value={form.note}
              />
            </label>

            <label className="block">
              <span className="label">수정 사유</span>
              <input
                className="field mt-1"
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
                value={form.reason}
              />
            </label>

            <button className="primary-button w-full" disabled={isMutating} type="submit">
              {isMutating && !approvingDeviceId ? (
                <>
                  <Spinner className="mr-2" />
                  저장 중
                </>
              ) : (
                "저장"
              )}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ record }: { record: AttendanceRecord }) {
  const isMissingCheckIn = !record.checkInAt && record.checkOutAt;
  const label = isMissingCheckIn
    ? "출근누락"
    : record.checkOutAt
      ? "완료"
      : record.checkInAt
        ? "근무중"
        : "미출근";
  const className = isMissingCheckIn
    ? "bg-warn/10 text-warn"
    : record.checkOutAt
    ? "bg-accent/10 text-accent"
    : record.checkInAt
      ? "bg-warn/10 text-warn"
      : "bg-slate-100 text-muted";

  return (
    <span className={`rounded px-2 py-1 text-xs font-bold ${className}`}>
      {label}
    </span>
  );
}

function emptyForm(): AttendanceForm {
  return {
    id: null,
    employeeId: "",
    workDate: getKstDate(0),
    checkInAt: "",
    checkOutAt: "",
    workType: "office",
    note: "",
    reason: "",
  };
}

function formFromRecord(record: AttendanceRecord): AttendanceForm {
  return {
    id: record.id,
    employeeId: record.employeeId,
    workDate: record.workDate,
    checkInAt: toKstDateTimeInput(record.checkInAt),
    checkOutAt: toKstDateTimeInput(record.checkOutAt),
    workType: record.workType,
    note: record.note ?? "",
    reason: "",
  };
}

function getKstDate(offsetDays: number) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kstNow.setUTCDate(kstNow.getUTCDate() + offsetDays);
  return kstNow.toISOString().slice(0, 10);
}

function getMonthStart() {
  const today = getKstDate(0);
  return `${today.slice(0, 8)}01`;
}

function getMonthEnd() {
  const today = getKstDate(0);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function toKstDateTimeInput(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

function formatTimeOnly(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatIpPair(checkInIp: string | null, checkOutIp: string | null) {
  return `${formatIp(checkInIp)} / ${formatIp(checkOutIp)}`;
}

function formatIp(value: string | null) {
  if (!value) {
    return "-";
  }

  if (value === "::1" || value === "127.0.0.1" || value === "::ffff:127.0.0.1") {
    return "개발환경(localhost)";
  }

  if (value === "auto") {
    return "자동마감";
  }

  return value;
}

function displayEmployee(employee: {
  name?: string;
  employeeName?: string;
  employeeNo?: string;
}) {
  const name = employee.name ?? employee.employeeName ?? "";
  return employee.employeeNo && employee.employeeNo !== name
    ? `${name} (${employee.employeeNo})`
    : name;
}

function groupRecordsByEmployee(records: AttendanceRecord[]) {
  const groups = new Map<
    string,
    { employeeKey: string; employeeName: string; records: AttendanceRecord[] }
  >();

  for (const record of records) {
    const key = record.employeeId;
    if (!groups.has(key)) {
      groups.set(key, {
        employeeKey: key,
        employeeName: displayEmployee(record),
        records: [],
      });
    }
    groups.get(key)?.records.push(record);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      records: group.records.sort((a, b) => b.workDate.localeCompare(a.workDate)),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

function buildMonthlySummary(
  employees: Employee[],
  records: AttendanceRecord[],
  startDate: string,
  endDate: string,
) {
  const recordMap = new Map(records.map((record) => [`${record.employeeId}_${record.workDate}`, record]));
  const days = getCalendarDateRange(startDate, endDate);

  return employees.map((employee) => {
    const employeeDays = days.map((calendarDay) => {
      if (!calendarDay.date) {
        return {
          date: calendarDay.key,
          day: "",
          status: "placeholder",
          label: "",
        };
      }

      const record = recordMap.get(`${employee.id}_${calendarDay.date}`);
      const status = record?.checkOutAt && !record.checkInAt
        ? "missing_check_in"
        : record?.checkOutAt
          ? "done"
          : record?.checkInAt
            ? "open"
            : "empty";
      return {
        date: calendarDay.date,
        day: calendarDay.date.slice(8, 10),
        status,
        label: status === "done"
          ? "완료"
          : status === "missing_check_in"
            ? "출근누락"
            : status === "open"
              ? "퇴근누락"
              : "기록없음",
      };
    });

    return {
      employee,
      days: employeeDays,
      checkInDays: employeeDays.filter((day) => day.status !== "empty" && day.status !== "placeholder").length,
      openDays: employeeDays.filter((day) => day.status === "open" || day.status === "missing_check_in").length,
    };
  });
}

function getCalendarDateRange(startDate: string, endDate: string) {
  const dates: Array<{ date: string | null; key: string }> = [];
  const cursor = dateStringToUtcDate(startDate);
  const end = dateStringToUtcDate(endDate);
  const startDayOfWeek = cursor.getUTCDay();

  for (let index = 0; index < startDayOfWeek; index += 1) {
    dates.push({ date: null, key: `start-${index}` });
  }

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    dates.push({ date, key: date });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  let endPaddingIndex = 0;
  while (dates.length % 7 !== 0) {
    dates.push({ date: null, key: `end-${endPaddingIndex}` });
    endPaddingIndex += 1;
  }

  return dates;
}

function dateStringToUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dayClassName(status: string) {
  const base = "inline-flex h-7 items-center justify-center rounded text-xs font-bold";
  if (status === "placeholder") return `${base} bg-transparent`;
  if (status === "done") return `${base} bg-accent text-white`;
  if (status === "missing_check_in") return `${base} bg-warn text-white`;
  if (status === "open") return `${base} bg-warn text-white`;
  return `${base} bg-white text-slate-400 ring-1 ring-line`;
}
