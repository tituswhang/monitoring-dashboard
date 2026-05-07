import type { MonitoringQuery, MonitoringResult, RowStatus, SpringPage } from "../types/monitoring";
import { MOCK_QUERIES, MOCK_RESULTS } from "./mockData";

// In-memory state — mutations are reflected immediately within the session
let queries: MonitoringQuery[] = MOCK_QUERIES.map((q) => ({ ...q }));
let results: MonitoringResult[] = MOCK_RESULTS.map((r) => ({ ...r, rows: r.rows.map((rw) => ({ ...rw })) }));
let nextMsorId = Math.max(...queries.map((q) => q.msorId)) + 1;
let nextResultId = Math.max(...results.map((r) => r.resultId)) + 1;

const delay = (ms = 300) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function fetchQueries(active?: "Y" | "N"): Promise<MonitoringQuery[]> {
  return delay().then(() =>
    active ? queries.filter((q) => q.activeYn === active) : [...queries],
  );
}

export function fetchResults(
  msorId: number,
  opts: { date?: string; page?: number; size?: number } = {},
): Promise<SpringPage<MonitoringResult>> {
  return delay().then(() => {
    const page = opts.page ?? 0;
    const size = opts.size ?? 60;
    let filtered = results.filter((r) => r.msorId === msorId);
    if (opts.date) filtered = filtered.filter((r) => r.runDate === opts.date);
    filtered = [...filtered].sort((a, b) => b.runAt.localeCompare(a.runAt));
    const total = filtered.length;
    const slice = filtered.slice(page * size, page * size + size);
    return {
      content: slice,
      totalElements: total,
      totalPages: Math.ceil(total / size),
      number: page,
      size,
      first: page === 0,
      last: page >= Math.ceil(total / size) - 1,
    };
  });
}

export function triggerRun(msorId: number): Promise<void> {
  return delay(800).then(() => {
    const query = queries.find((q) => q.msorId === msorId);
    if (!query) throw new Error(`Query ${msorId} not found`);
    const now = new Date();
    const runAt = now.toISOString().replace("T", "T").slice(0, 19);
    const runDate = runAt.slice(0, 10);
    const newResult: MonitoringResult = {
      resultId: nextResultId++,
      msorId,
      runAt,
      runDate,
      resultCount: 0,
      resultStatus: "SUCCESS",
      executionMs: Math.floor(Math.random() * 600 + 100),
      errorMessage: null,
      errorDetail: null,
      triggeredAlertYn: "N",
      dwSyncedYn: "N",
      createdAt: runAt,
      rows: [],
    };
    results = [newResult, ...results];
  });
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
  return delay().then(() => {
    const idx = queries.findIndex((q) => q.msorId === msorId);
    if (idx === -1) throw new Error(`Query ${msorId} not found`);
    queries[idx] = {
      ...queries[idx],
      ...Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString().slice(0, 19),
    };
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
  return delay().then(() => {
    const now = new Date().toISOString().slice(0, 19);
    const newQuery: MonitoringQuery = {
      msorId: nextMsorId++,
      title: payload.title,
      description: payload.description ?? null,
      dbType: payload.dbType ?? "DATABASE1",
      sqlQuery: payload.sqlQuery,
      queryInterval: payload.queryInterval,
      sheetName: payload.sheetName ?? null,
      ownerName: payload.ownerName ?? null,
      ownerEmail: payload.ownerEmail ?? null,
      recipients: payload.recipients,
      activeYn: payload.activeYn ?? "Y",
      frequentYn: payload.frequentYn ?? "N",
      color: payload.color ?? null,
      createdAt: now,
      updatedAt: now,
    };
    queries = [...queries, newQuery];
    return newQuery;
  });
}

export function deleteQuery(msorId: number): Promise<void> {
  return delay().then(() => {
    queries = queries.filter((q) => q.msorId !== msorId);
    results = results.filter((r) => r.msorId !== msorId);
  });
}

export function updateRow(rowId: number, rowStatus: RowStatus, rowComment: string | null): Promise<void> {
  return delay().then(() => {
    for (const result of results) {
      const row = result.rows.find((r) => r.rowId === rowId);
      if (row) {
        row.rowStatus = rowStatus;
        row.rowComment = rowComment;
        return;
      }
    }
    throw new Error(`Row ${rowId} not found`);
  });
}

