import type {
  AllCasesFilters, AllCasesRow, CaseActivity, CaseRef, CaseWorkloadResponse,
  MonitoringQuery, MonitoringResult, MonitoringResultRow, PersonWorkload, RowStatus, SpringPage,
} from "../types/monitoring";
import type { AppRole } from "../auth/auth";
import { getCurrentUser } from "../auth/auth";
import { MOCK_ACTIVITY, MOCK_QUERIES, MOCK_RESULTS, MOCK_USERS, type MockActivity } from "./mockData";

// This build ships without a backend: every call below resolves from the in-memory
// fixtures instead of hitting /v1. Mutations are applied to that state, so they are
// reflected immediately and consistently for the rest of the session, and lost on
// reload. The exported signatures match the real client one-for-one, so swapping this
// module for the HTTP one is the only change needed to point at a live service.

let queries: MonitoringQuery[] = MOCK_QUERIES.map((q) => ({ ...q }));
let results: MonitoringResult[] = MOCK_RESULTS.map((r) => ({ ...r, rows: r.rows.map((rw) => ({ ...rw })) }));
let activity: MockActivity[] = MOCK_ACTIVITY.map((a) => ({ ...a }));
let users: AppUser[] = MOCK_USERS.map((u) => ({ ...u, roles: [...u.roles] }));

let nextMsorId = Math.max(...queries.map((q) => q.msorId)) + 1;
let nextResultId = Math.max(...results.map((r) => r.resultId)) + 1;
let nextRowId = Math.max(...results.flatMap((r) => r.rows.map((rw) => rw.rowId)), 0) + 1;
let nextActivityId = Math.max(...activity.map((a) => a.activityId), 0) + 1;

const delay = (ms = 300) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const nowStamp = () => new Date().toISOString().slice(0, 19);

/** Who a mutation is attributed to. Mirrors the server reading the caller's token. */
function author(): { name: string | null; email: string | null } {
  const me = getCurrentUser();
  return { name: me?.name ?? null, email: me?.email ?? null };
}

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

/**
 * The date range a run scans on the **target** database (`so.created_at` and friends).
 *
 * Not to be confused with the All Cases `fromDate`/`toDate` filter, which narrows rows
 * already collected, by the date they were first seen. Both are inclusive.
 */
export interface RunWindow {
  /** Inclusive, `yyyy-MM-dd`. Ignored when `includePastUnresolved` is set. */
  beginDate: string;
  /** Inclusive, `yyyy-MM-dd`. */
  endDate: string;
  /** Widen the scan back to the configured floor — slower, and it neither alerts nor syncs. */
  includePastUnresolved?: boolean;
}

/**
 * Starts a run and resolves once it has been accepted. The real service validates the
 * window and answers 400 on a bad one; the same rejections are reproduced here so the
 * demo exercises the error path rather than silently accepting anything.
 */
export function triggerRun(msorId: number, window?: RunWindow): Promise<void> {
  return delay(800).then(() => {
    const query = queries.find((q) => q.msorId === msorId);
    if (!query) throw new Error(`Query ${msorId} not found`);

    const pastUnresolved = window?.includePastUnresolved === true;
    if (window && !pastUnresolved) {
      if (window.beginDate > window.endDate) {
        throw new Error("Begin date must not be after end date.");
      }
    }

    const runAt = nowStamp();
    const runDate = runAt.slice(0, 10);
    // A re-run re-reports the cases still open, and withholds those already marked Done —
    // which is what suppressedCount records.
    const priorRows = results
      .filter((r) => r.msorId === msorId)
      .flatMap((r) => r.rows);
    const latestByCase = new Map<string, MonitoringResultRow>();
    for (const r of priorRows) latestByCase.set(r.caseKey, r);
    const stillOpen = [...latestByCase.values()].filter((r) => r.rowStatus !== "DONE");
    const suppressed = latestByCase.size - stillOpen.length;

    const resultId = nextResultId++;
    const rows: MonitoringResultRow[] = stillOpen.map((r) => ({
      ...r,
      rowId: nextRowId++,
      data: { ...r.data },
    }));

    const newResult: MonitoringResult = {
      resultId,
      msorId,
      runAt,
      runDate,
      resultCount: rows.length,
      suppressedCount: suppressed,
      resultStatus: "SUCCESS",
      executionMs: Math.floor(Math.random() * 600 + 100),
      errorMessage: null,
      errorDetail: null,
      beginDate: window ? (pastUnresolved ? null : window.beginDate) : runDate,
      endDate: window ? window.endDate : runDate,
      pastUnresolvedYn: pastUnresolved ? "Y" : "N",
      triggeredAlertYn: rows.length > 0 && !pastUnresolved ? "Y" : "N",
      dwSyncedYn: "N",
      createdAt: runAt,
      rows,
    };
    results = [newResult, ...results];
  });
}

export interface QueryUpdatePayload {
  title?: string;
  description?: string | null;
  dbType?: string;
  category?: string;
  sheetName?: string | null;
  sqlQuery?: string;
  recipients?: string | null;
  activeYn?: "Y" | "N";
  frequentYn?: "Y" | "N";
  onHoldYn?: "Y" | "N";
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
      updatedAt: nowStamp(),
    };
  });
}

export interface QueryCreatePayload {
  title: string;
  description?: string | null;
  dbType?: string;
  category?: string;
  sheetName?: string;
  sqlQuery: string;
  queryInterval: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  recipients: string;
  activeYn?: "Y" | "N";
  frequentYn?: "Y" | "N";
  onHoldYn?: "Y" | "N";
  color?: string | null;
}

export function createQuery(payload: QueryCreatePayload): Promise<MonitoringQuery> {
  return delay().then(() => {
    const now = nowStamp();
    const newQuery: MonitoringQuery = {
      msorId: nextMsorId++,
      title: payload.title,
      description: payload.description ?? null,
      dbType: payload.dbType ?? "DATABASE1",
      category: payload.category ?? "Other",
      sqlQuery: payload.sqlQuery,
      queryInterval: payload.queryInterval,
      sheetName: payload.sheetName ?? null,
      ownerName: payload.ownerName ?? null,
      ownerEmail: payload.ownerEmail ?? null,
      recipients: payload.recipients,
      activeYn: payload.activeYn ?? "Y",
      frequentYn: payload.frequentYn ?? "N",
      onHoldYn: payload.onHoldYn ?? "N",
      // New items are written against the windowed template, so they take a caller range.
      dateRangeSupported: true,
      defaultLookbackDays: 1,
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
    activity = activity.filter((a) => a.msorId !== msorId);
  });
}

export function setOnHold(msorId: number, onHold: boolean): Promise<void> {
  return delay().then(() => {
    const idx = queries.findIndex((q) => q.msorId === msorId);
    if (idx === -1) throw new Error(`Query ${msorId} not found`);
    queries[idx] = { ...queries[idx], onHoldYn: onHold ? "Y" : "N", updatedAt: nowStamp() };
  });
}

/**
 * One row per case, carrying its **first-seen** date rather than the date of the run it
 * came from — the server aliases `MIN(run_date) OVER (PARTITION BY msor_id, case_key)`
 * to `runDate`, and `fromDate`/`toDate` filter on that. Reproduced here so the All Cases
 * grid and its Case Age pie agree with the real service.
 */
export function fetchAllResultRows(filters: AllCasesFilters = {}): Promise<AllCasesRow[]> {
  return delay().then(() => {
    const byQuery = new Map(queries.map((q) => [q.msorId, q]));

    // First sighting per (msorId, caseKey), and the newest row carrying its current state.
    const firstSeen = new Map<string, string>();
    const latest = new Map<string, { row: MonitoringResultRow; result: MonitoringResult }>();

    for (const result of results) {
      for (const row of result.rows) {
        const key = `${result.msorId}:${row.caseKey}`;
        const seen = firstSeen.get(key);
        if (!seen || result.runDate < seen) firstSeen.set(key, result.runDate);
        const held = latest.get(key);
        if (!held || result.runAt > held.result.runAt) latest.set(key, { row, result });
      }
    }

    let rows: AllCasesRow[] = [...latest.entries()].map(([key, { row, result }]) => {
      const query = byQuery.get(result.msorId);
      return {
        rowId: row.rowId,
        rowStatus: row.rowStatus,
        rowComment: row.rowComment,
        caseKey: row.caseKey,
        caseKeySource: row.caseKeySource,
        activityCount: activity.filter(
          (a) => a.msorId === result.msorId && a.caseKey === row.caseKey,
        ).length,
        data: row.data,
        resultId: result.resultId,
        msorId: result.msorId,
        title: query?.title ?? `Query ${result.msorId}`,
        dbType: query?.dbType ?? "DATABASE1",
        runDate: firstSeen.get(key) ?? result.runDate,
      };
    });

    if (filters.dbType) rows = rows.filter((r) => r.dbType === filters.dbType);
    if (filters.rowStatus) rows = rows.filter((r) => r.rowStatus === filters.rowStatus);
    if (filters.msorId != null) rows = rows.filter((r) => r.msorId === filters.msorId);
    if (filters.fromDate) rows = rows.filter((r) => r.runDate >= filters.fromDate!);
    if (filters.toDate) rows = rows.filter((r) => r.runDate <= filters.toDate!);

    return rows.sort((a, b) => b.runDate.localeCompare(a.runDate) || a.caseKey.localeCompare(b.caseKey));
  });
}

/**
 * Who touched which case during `month` (`yyyy-MM`), derived from the activity log the
 * same way the server derives it: a case counts for a person if they commented on it or
 * changed its status that month. Membership is not exclusive — a case two people both
 * touched appears in both lists, so summing `cases.length` over-counts.
 */
export function fetchCaseWorkload(month?: string): Promise<CaseWorkloadResponse> {
  return delay().then(() => {
    const months = activity.map((a) => a.createdAt.slice(0, 7)).sort();
    const earliestMonth = months.length > 0 ? months[0] : null;
    // Without a server there is no authoritative "now", so the demo answers for the month
    // holding the newest activity rather than the browser's idea of the current one.
    const target = month ?? (months.length > 0 ? months[months.length - 1] : "");

    const inMonth = activity.filter(
      (a) => a.createdAt.slice(0, 7) === target
        && (a.entryType === "COMMENT" || a.entryType === "STATUS_CHANGE"),
    );

    const me = getCurrentUser()?.email?.toLowerCase() ?? null;
    const byPerson = new Map<string, { name: string | null; cases: Map<string, CaseRef> }>();
    const unattributed = new Map<string, CaseRef>();

    for (const a of inMonth) {
      const ref: CaseRef = { msorId: a.msorId, caseKey: a.caseKey };
      const refKey = `${a.msorId}:${a.caseKey}`;
      if (!a.authorEmail) {
        unattributed.set(refKey, ref);
        continue;
      }
      const email = a.authorEmail.toLowerCase();
      const entry = byPerson.get(email) ?? { name: a.authorName, cases: new Map() };
      entry.name = entry.name ?? a.authorName;
      entry.cases.set(refKey, ref);
      byPerson.set(email, entry);
    }

    const people: PersonWorkload[] = [...byPerson.entries()]
      .map(([authorEmail, v]) => ({
        authorEmail,
        authorName: v.name,
        isYou: me !== null && me === authorEmail,
        cases: [...v.cases.values()],
      }))
      .sort((a, b) => b.cases.length - a.cases.length);

    return {
      month: target,
      earliestMonth,
      people,
      unattributed: [...unattributed.values()],
    };
  });
}

export function updateRow(rowId: number, rowStatus: RowStatus, rowComment: string | null): Promise<void> {
  return delay().then(() => {
    for (const result of results) {
      const row = result.rows.find((r) => r.rowId === rowId);
      if (!row) continue;

      // A status change is journalled to the case timeline, exactly as the server does —
      // otherwise the activity count on the grid would drift from the thread behind it.
      if (row.rowStatus !== rowStatus) {
        const who = author();
        activity = [...activity, {
          activityId: nextActivityId++,
          msorId: result.msorId,
          caseKey: row.caseKey,
          entryType: "STATUS_CHANGE",
          authorName: who.name,
          authorEmail: who.email,
          commentText: null,
          fieldName: "rowStatus",
          oldValue: row.rowStatus,
          newValue: rowStatus,
          createdAt: nowStamp(),
        }];
        bumpActivityCount(result.msorId, row.caseKey);
      }

      row.rowStatus = rowStatus;
      row.rowComment = rowComment;
      return;
    }
    throw new Error(`Row ${rowId} not found`);
  });
}

/** Keeps every copy of a case (it recurs across runs) showing the same activity count. */
function bumpActivityCount(msorId: number, caseKey: string): void {
  for (const result of results) {
    if (result.msorId !== msorId) continue;
    for (const row of result.rows) {
      if (row.caseKey === caseKey) row.activityCount += 1;
    }
  }
}

// ── Case activity timeline ───────────────────────────────────────────────────
// Comments, status changes, and data-drift entries for a case, keyed by
// (msorId, caseKey) so the thread persists as a case recurs across runs.

const toCaseActivity = (a: MockActivity): CaseActivity => ({
  activityId: a.activityId,
  entryType: a.entryType,
  authorName: a.authorName,
  authorEmail: a.authorEmail,
  commentText: a.commentText,
  fieldName: a.fieldName,
  oldValue: a.oldValue,
  newValue: a.newValue,
  createdAt: a.createdAt,
});

export function fetchCaseActivity(msorId: number, caseKey: string): Promise<CaseActivity[]> {
  return delay(150).then(() =>
    activity
      .filter((a) => a.msorId === msorId && a.caseKey === caseKey)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toCaseActivity),
  );
}

export function addCaseComment(msorId: number, caseKey: string, text: string): Promise<CaseActivity> {
  return delay(200).then(() => {
    const who = author();
    const entry: MockActivity = {
      activityId: nextActivityId++,
      msorId,
      caseKey,
      entryType: "COMMENT",
      authorName: who.name,
      authorEmail: who.email,
      commentText: text,
      fieldName: null,
      oldValue: null,
      newValue: null,
      createdAt: nowStamp(),
    };
    activity = [...activity, entry];
    bumpActivityCount(msorId, caseKey);
    return toCaseActivity(entry);
  });
}

// ── User & role administration ───────────────────────────────────────────────
// Roles are assigned against this app's own tables, not Cognito groups, so all of
// this takes effect without anyone visiting the AWS console.

export interface InviteUserPayload {
  email: string;
  name?: string;
  roles?: AppRole[];
}

export interface InviteUserResult {
  email: string;
  roles: AppRole[];
  /** The dashboard link to send them. No account is created — they sign themselves up. */
  inviteUrl: string;
  alreadyInvited: boolean;
}

export interface AppUser {
  email: string;
  name: string | null;
  roles: AppRole[];
  active: boolean;
  /** Admin by config (AUTH_BOOTSTRAP_ADMINS) rather than by a row — cannot be edited here. */
  bootstrapAdmin: boolean;
  createdAt: string | null;
  /** Null when they have been invited but have never signed in. */
  lastLoginAt: string | null;
}

export function fetchUsers(): Promise<AppUser[]> {
  return delay().then(() => users.map((u) => ({ ...u, roles: [...u.roles] })));
}

export function inviteUser(payload: InviteUserPayload): Promise<InviteUserResult> {
  return delay().then(() => {
    const email = payload.email.trim().toLowerCase();
    if (!email) throw new Error("An email address is required.");
    const roles = payload.roles?.length ? payload.roles : (["VIEWER"] as AppRole[]);
    const existing = users.find((u) => u.email.toLowerCase() === email);

    if (existing) {
      return {
        email: existing.email,
        roles: existing.roles,
        inviteUrl: `${window.location.origin}${import.meta.env.BASE_URL}`,
        alreadyInvited: true,
      };
    }

    users = [...users, {
      email,
      name: payload.name?.trim() || null,
      roles,
      active: true,
      bootstrapAdmin: false,
      createdAt: nowStamp(),
      lastLoginAt: null,
    }];

    return {
      email,
      roles,
      inviteUrl: `${window.location.origin}${import.meta.env.BASE_URL}`,
      alreadyInvited: false,
    };
  });
}

/** Sends the full role set the user should end up with, not a delta. */
export function updateUserRoles(email: string, roles: AppRole[]): Promise<AppUser> {
  return delay().then(() => {
    const idx = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) throw new Error(`No user ${email}`);
    if (users[idx].bootstrapAdmin) {
      throw new Error("This user is an administrator by configuration and cannot be edited here.");
    }
    users[idx] = { ...users[idx], roles: [...roles] };
    return { ...users[idx], roles: [...users[idx].roles] };
  });
}

export function deactivateUser(email: string): Promise<void> {
  return delay().then(() => {
    const idx = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) throw new Error(`No user ${email}`);
    if (users[idx].bootstrapAdmin) {
      throw new Error("This user is an administrator by configuration and cannot be removed here.");
    }
    users[idx] = { ...users[idx], active: false };
  });
}
