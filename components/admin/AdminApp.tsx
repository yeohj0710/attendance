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

export function AdminApp() {
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [admin, setAdmin] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRequest[]>([]);
  const [startDate, setStartDate] = useState(() => getKstDate(-7));
  const [endDate, setEndDate] = useState(() => getKstDate(0));
  const [employeeId, setEmployeeId] = useState("");
  const [form, setForm] = useState<AttendanceForm>(() => emptyForm());
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (employeeId) params.set("employeeId", employeeId);
    return params.toString();
  }, [employeeId, endDate, startDate]);

  const load = useCallback(
    async (storedAuth: StoredAuth) => {
      setMessage("");
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
    },
    [query],
  );

  useEffect(() => {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);

    if (!storedAuth) {
      setIsLoading(false);
      return;
    }

    load(storedAuth)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "관리자 정보를 불러오지 못했습니다.");
        clearToken();
        setAuth(null);
      })
      .finally(() => setIsLoading(false));
  }, [load]);

  async function refresh() {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);
    if (!storedAuth) {
      return;
    }

    await load(storedAuth);
  }

  async function submitAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) {
      return;
    }

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
    if (!auth) {
      return;
    }

    setIsMutating(true);
    setMessage("");
    try {
      await apiFetch(`/api/admin/devices/${id}/approve`, {
        method: "POST",
        auth,
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "기기 변경을 승인하지 못했습니다.");
    } finally {
      setIsMutating(false);
    }
  }

  async function downloadCsv() {
    if (!auth) {
      return;
    }

    setMessage("");
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
    setAuth(null);
    setAdmin(null);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 text-sm text-muted">
        불러오는 중
      </main>
    );
  }

  if (!auth || !admin) {
    return <LoginPanel onLogin={refresh} />;
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-7xl px-4 py-5">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">관리자</p>
          <h1 className="text-2xl font-bold text-ink">출퇴근 현황</h1>
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

      <section className="mb-4 rounded-lg border border-line bg-white p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.3fr_auto_auto]">
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
                  {employee.name} ({employee.employeeNo})
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button self-end" onClick={refresh} type="button">
            조회
          </button>
          <button className="primary-button self-end" onClick={downloadCsv} type="button">
            CSV
          </button>
        </div>
      </section>

      {devices.length > 0 ? (
        <section className="mb-4 rounded-lg border border-line bg-white p-4 shadow-panel">
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
                    <td className="py-2 pr-3 font-semibold">
                      {device.employeeName} ({device.employeeNo})
                    </td>
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
                        승인
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 pr-3">날짜</th>
                  <th className="py-2 pr-3">직원</th>
                  <th className="py-2 pr-3">출근</th>
                  <th className="py-2 pr-3">퇴근</th>
                  <th className="py-2 pr-3">유형</th>
                  <th className="py-2 pr-3">IP</th>
                  <th className="py-2 pr-3">메모</th>
                  <th className="py-2 text-right">수정</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 font-medium">{record.workDate}</td>
                    <td className="py-2 pr-3">
                      {record.employeeName} ({record.employeeNo})
                    </td>
                    <td className="py-2 pr-3">{formatKstDateTime(record.checkInAt)}</td>
                    <td className="py-2 pr-3">{formatKstDateTime(record.checkOutAt)}</td>
                    <td className="py-2 pr-3">{workTypeLabels[record.workType]}</td>
                    <td className="py-2 pr-3">
                      {record.checkInIp ?? "-"} / {record.checkOutIp ?? "-"}
                    </td>
                    <td className="max-w-48 truncate py-2 pr-3">{record.note ?? "-"}</td>
                    <td className="py-2 text-right">
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
                {records.length === 0 ? (
                  <tr>
                    <td className="py-8 text-center text-muted" colSpan={8}>
                      조회된 기록이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
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
                    {employee.name} ({employee.employeeNo})
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
              저장
            </button>
          </form>
        </section>
      </div>
    </main>
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

function toKstDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}
