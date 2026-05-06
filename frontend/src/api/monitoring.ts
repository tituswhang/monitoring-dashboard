import type { MonitoringQuery, MonitoringResult, RowStatus, SpringPage } from "../types/monitoring";

const BASE = "/v1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function fetchQueries(active?: "Y" | "N"): Promise<MonitoringQuery[]> {
  const q = active ? `?active=${active}` : "";
  return get<MonitoringQuery[]>(`/monitoring-queries${q}`);
}

export function fetchResults(
  msorId: number,
  opts: { date?: string; page?: number; size?: number } = {},
): Promise<SpringPage<MonitoringResult>> {
  const params = new URLSearchParams({ msorId: String(msorId) });
  if (opts.date) params.set("date", opts.date);
  params.set("page", String(opts.page ?? 0));
  params.set("size", String(opts.size ?? 60));
  return get<SpringPage<MonitoringResult>>(`/monitoring-results?${params}`);
}

export function triggerRun(msorId: number): Promise<void> {
  return fetch(`${BASE}/monitoring-queries/${msorId}/run`, { method: "POST" }).then(
    () => undefined,
  );
}

export interface QueryUpdatePayload {
  title?: string;
  description?: string | null;
  dbType?: string;
  sheetName?: string | null;
  sqlQuery?: string;
  recipients?: string | null;
  activeYn?: "Y" | "N";
  frequentYn?: "Y" | "N";
  queryInterval?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  color?: string | null;
}

export function updateQuery(msorId: number, payload: QueryUpdatePayload): Promise<void> {
  return fetch(`${BASE}/monitoring-queries/${msorId}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  });
}

export interface QueryCreatePayload {
  title: string;
  description?: string | null;
  dbType?: string;
  sheetName?: string;
  sqlQuery: string;
  queryInterval: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  recipients: string;
  activeYn?: "Y" | "N";
  frequentYn?: "Y" | "N";
  color?: string | null;
}

export function createQuery(payload: QueryCreatePayload): Promise<MonitoringQuery> {
  return fetch(`${BASE}/monitoring-queries/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<MonitoringQuery>;
  });
}

export function deleteQuery(msorId: number): Promise<void> {
  return fetch(`${BASE}/monitoring-queries/${msorId}`, { method: "DELETE" }).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  });
}

export function updateRow(rowId: number, rowStatus: RowStatus, rowComment: string | null): Promise<void> {
  return fetch(`${BASE}/monitoring-result-rows/${rowId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rowStatus, rowComment }),
  }).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  });
}
