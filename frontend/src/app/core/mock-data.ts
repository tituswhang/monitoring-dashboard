import type { MonitoringQuery, MonitoringResult, MonitoringResultRow, RowStatus } from './models/monitoring';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const BASE_QUERIES: MonitoringQuery[] = [
  {
    msorId: 1,
    title: "Unfulfilled Orders (>48h)",
    description: "Detects orders that have not been fulfilled within 48 hours of placement.",
    dbType: "DATABASE1",
    category: "Order Delivery",
    sqlQuery:
      "SELECT order_id, customer_email, created_at, total_amount\nFROM orders\nWHERE status = 'PENDING'\n  AND created_at < NOW() - INTERVAL 48 HOUR",
    queryInterval: "0 0 8 * * MON-FRI",
    sheetName: "Unfulfilled Orders",
    ownerName: "Ops Team",
    ownerEmail: "ops@example.com",
    recipients: "ops@example.com,alerts@example.com",
    activeYn: "Y",
    frequentYn: "N",
    onHoldYn: "N",
    dateRangeSupported: true,
    defaultLookbackDays: 2,
    color: "#ef4444",
    createdAt: "2025-01-15T09:00:00",
    updatedAt: "2025-03-10T14:22:00",
  },
  {
    msorId: 2,
    title: "Failed Payment Transactions",
    description: "Monitors payment gateway failures logged in the last 24 hours.",
    dbType: "DATABASE2",
    category: "PG / Payment",
    sqlQuery:
      "SELECT txn_id, user_id, amount, error_code, created_at\nFROM transactions\nWHERE status = 'FAILED'\n  AND created_at >= CURDATE()",
    queryInterval: "0 0 7 * * *",
    sheetName: "Failed Payments",
    ownerName: "Finance Team",
    ownerEmail: "finance@example.com",
    recipients: "finance@example.com,ops@example.com",
    activeYn: "Y",
    frequentYn: "Y",
    onHoldYn: "N",
    dateRangeSupported: true,
    defaultLookbackDays: 1,
    color: "#f97316",
    createdAt: "2025-01-20T10:15:00",
    updatedAt: "2025-04-01T08:00:00",
  },
  {
    msorId: 3,
    title: "Inventory Below Reorder Point",
    description: "Flags SKUs where current stock has dropped below the configured reorder threshold.",
    dbType: "DATABASE1",
    category: "Service",
    sqlQuery:
      "SELECT sku, product_name, stock_qty, reorder_point\nFROM inventory\nWHERE stock_qty < reorder_point\n  AND active = 1",
    queryInterval: "0 30 6 * * MON-FRI",
    sheetName: "Low Inventory",
    ownerName: "Supply Chain",
    ownerEmail: "supply@example.com",
    recipients: "supply@example.com",
    activeYn: "Y",
    frequentYn: "N",
    onHoldYn: "N",
    dateRangeSupported: false,
    defaultLookbackDays: 7,
    color: "#eab308",
    createdAt: "2025-02-03T11:00:00",
    updatedAt: "2025-02-03T11:00:00",
  },
  {
    msorId: 4,
    title: "Duplicate Order Items",
    description: "Checks for order_items rows with the same order_id and sku inserted more than once.",
    dbType: "DATABASE1",
    category: "Order Validation",
    sqlQuery:
      "SELECT order_id, sku, COUNT(*) AS cnt\nFROM order_items\nGROUP BY order_id, sku\nHAVING cnt > 1",
    queryInterval: "0 0 9 * * *",
    sheetName: "Duplicate Items",
    ownerName: "Data Quality",
    ownerEmail: "dq@example.com",
    recipients: "dq@example.com,ops@example.com",
    activeYn: "Y",
    frequentYn: "N",
    onHoldYn: "N",
    dateRangeSupported: true,
    defaultLookbackDays: 3,
    color: "#8b5cf6",
    createdAt: "2025-02-14T09:30:00",
    updatedAt: "2025-04-20T16:45:00",
  },
  {
    msorId: 5,
    title: "Stale Sessions (>24h)",
    description: "Identifies user sessions that have been open for more than 24 hours without activity.",
    dbType: "DATABASE3",
    category: "Interface Health",
    sqlQuery:
      "SELECT session_id, user_id, last_activity, created_at\nFROM user_sessions\nWHERE last_activity < NOW() - INTERVAL 24 HOUR\n  AND closed_at IS NULL",
    queryInterval: "0 0 2 * * *",
    sheetName: "Stale Sessions",
    ownerName: "Platform Team",
    ownerEmail: "platform@example.com",
    recipients: "platform@example.com",
    activeYn: "Y",
    frequentYn: "N",
    onHoldYn: "Y",
    dateRangeSupported: true,
    defaultLookbackDays: 1,
    color: "#06b6d4",
    createdAt: "2025-03-01T08:00:00",
    updatedAt: "2025-03-01T08:00:00",
  },
  {
    msorId: 6,
    title: "Refunds Without Approval",
    description: "Catches refund records missing a manager approval_id, which indicates a workflow gap.",
    dbType: "DATABASE2",
    category: "Cancel / Refund",
    sqlQuery:
      "SELECT refund_id, order_id, amount, requested_by, created_at\nFROM refunds\nWHERE approval_id IS NULL\n  AND created_at >= CURDATE() - INTERVAL 7 DAY",
    queryInterval: "0 0 8 * * MON-FRI",
    sheetName: "Unapproved Refunds",
    ownerName: "Finance Team",
    ownerEmail: "finance@example.com",
    recipients: "finance@example.com,compliance@example.com",
    activeYn: "Y",
    frequentYn: "N",
    onHoldYn: "N",
    dateRangeSupported: true,
    defaultLookbackDays: 5,
    color: "#ec4899",
    createdAt: "2025-03-10T13:00:00",
    updatedAt: "2025-05-01T10:30:00",
  },
  {
    msorId: 7,
    title: "Daily Revenue Summary",
    description: "Aggregates yesterday's completed order revenue for the daily finance report.",
    dbType: "DATABASE1",
    category: "Export & ERP I/F",
    sqlQuery:
      "SELECT DATE(created_at) AS order_date,\n       COUNT(*) AS order_count,\n       SUM(total_amount) AS revenue\nFROM orders\nWHERE status = 'COMPLETED'\n  AND DATE(created_at) = CURDATE() - INTERVAL 1 DAY\nGROUP BY DATE(created_at)",
    queryInterval: "0 0 6 * * *",
    sheetName: "Revenue Summary",
    ownerName: "Finance Team",
    ownerEmail: "finance@example.com",
    recipients: "finance@example.com,leadership@example.com",
    activeYn: "Y",
    frequentYn: "Y",
    onHoldYn: "N",
    dateRangeSupported: false,
    defaultLookbackDays: 1,
    color: "#10b981",
    createdAt: "2025-01-10T07:00:00",
    updatedAt: "2025-04-15T09:20:00",
  },
  {
    msorId: 8,
    title: "User Registration Anomalies",
    description: "Flags bulk account registrations from the same IP within a 1-hour window (bot detection).",
    dbType: "DATABASE4",
    category: "Membership",
    sqlQuery:
      "SELECT ip_address, COUNT(*) AS registrations, MIN(created_at) AS first_seen\nFROM users\nWHERE created_at >= NOW() - INTERVAL 1 HOUR\nGROUP BY ip_address\nHAVING registrations > 10",
    queryInterval: "0 0 * * * *",
    sheetName: "Registration Anomalies",
    ownerName: "Security Team",
    ownerEmail: "security@example.com",
    recipients: "security@example.com,ops@example.com",
    activeYn: "Y",
    frequentYn: "Y",
    onHoldYn: "N",
    dateRangeSupported: true,
    defaultLookbackDays: 1,
    color: "#64748b",
    createdAt: "2025-04-01T12:00:00",
    updatedAt: "2025-04-01T12:00:00",
  },
];

// ---------------------------------------------------------------------------
// Date spine
// ---------------------------------------------------------------------------
// A rolling 14-day window ending today, oldest first. Fixtures key their anomalies
// off these slots rather than literal dates so the demo always looks current — the
// Case Age breakdown, the date filters and the scan-range controls are all read
// against "now", and a frozen spine would render every case identically stale.

/** `yyyy-MM-dd`, `daysAgo` days before today in the viewer's zone. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The 14 rolling day slots. Spelled out as a union rather than left as
 * `Record<string, string>` so `D.DAY01` stays legal under Angular's
 * `noPropertyAccessFromIndexSignature` — and so a typo'd slot is a compile error
 * rather than a silent `undefined` in a fixture.
 */
type DayKey =
  | "DAY01" | "DAY02" | "DAY03" | "DAY04" | "DAY05" | "DAY06" | "DAY07"
  | "DAY08" | "DAY09" | "DAY10" | "DAY11" | "DAY12" | "DAY13" | "DAY14";

const D = Object.fromEntries(
  Array.from({ length: 14 }, (_, i) => [`DAY${String(i + 1).padStart(2, "0")}`, daysAgo(13 - i)]),
) as Record<DayKey, string>;

/**
 * The ten slots that carry scheduled runs. Positions 4, 5, 11 and 12 are left out to
 * mimic weekends: which real weekday a slot lands on shifts as the window rolls, so the
 * gaps are positional. Every anomaly fixture is keyed to a slot in this list, so the
 * pattern must stay fixed or those rows would stop being emitted.
 */
const WEEKDAYS = [
  D.DAY01, D.DAY02, D.DAY03, D.DAY06, D.DAY07,
  D.DAY08, D.DAY09, D.DAY10, D.DAY13, D.DAY14,
];
const ALL_DAYS = Object.values(D);

// ---------------------------------------------------------------------------
// Case activity
// ---------------------------------------------------------------------------
// Comments and status changes are threaded by (msorId, caseKey) so they survive a
// case recurring across runs. Seeded here for a handful of cases; anything a visitor
// adds during the session is appended in-memory by the API client.

/** How far back a widened "past unresolved cases" scan reaches. */
const PAST_UNRESOLVED_FLOOR = daysAgo(180);

export interface MockActivity {
  activityId: number;
  msorId: number;
  caseKey: string;
  entryType: "COMMENT" | "STATUS_CHANGE" | "DATA_CHANGE";
  authorName: string | null;
  authorEmail: string | null;
  commentText: string | null;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

const BASE_ACTIVITY: MockActivity[] = [
  {
    activityId: 1, msorId: 1, caseKey: "ORD-10512", entryType: "COMMENT",
    authorName: "Priya Raman", authorEmail: "priya.raman@example.com",
    commentText: "Warehouse confirms stock was allocated but the pick task never generated. Raised with fulfilment.",
    fieldName: null, oldValue: null, newValue: null, createdAt: `${D.DAY06}T09:12:00`,
  },
  {
    activityId: 2, msorId: 1, caseKey: "ORD-10512", entryType: "STATUS_CHANGE",
    authorName: "Priya Raman", authorEmail: "priya.raman@example.com",
    commentText: null, fieldName: "rowStatus", oldValue: "OPEN", newValue: "IN_PROGRESS",
    createdAt: `${D.DAY06}T09:12:30`,
  },
  {
    activityId: 3, msorId: 1, caseKey: "ORD-10512", entryType: "DATA_CHANGE",
    authorName: null, authorEmail: null,
    commentText: null, fieldName: "total_amount", oldValue: "312.00", newValue: "289.00",
    createdAt: `${D.DAY07}T08:00:12`,
  },
  {
    activityId: 9, msorId: 1, caseKey: "ORD-10512", entryType: "COMMENT",
    authorName: "Priya Raman", authorEmail: "priya.raman@example.com",
    commentText: "Pick task regenerated and the order shipped overnight. Closing.",
    fieldName: null, oldValue: null, newValue: null, createdAt: `${D.DAY08}T14:20:00`,
  },
  {
    activityId: 10, msorId: 1, caseKey: "ORD-10512", entryType: "STATUS_CHANGE",
    authorName: "Priya Raman", authorEmail: "priya.raman@example.com",
    commentText: null, fieldName: "rowStatus", oldValue: "IN_PROGRESS", newValue: "DONE",
    createdAt: `${D.DAY08}T14:20:30`,
  },
  {
    activityId: 4, msorId: 2, caseKey: "TXN-88451", entryType: "COMMENT",
    authorName: "Marcus Webb", authorEmail: "marcus.webb@example.com",
    commentText: "Gateway returned a soft decline. Customer retried successfully — safe to close once the settlement file lands.",
    fieldName: null, oldValue: null, newValue: null, createdAt: `${D.DAY06}T07:40:00`,
  },
  {
    activityId: 5, msorId: 2, caseKey: "TXN-88451", entryType: "STATUS_CHANGE",
    authorName: "Marcus Webb", authorEmail: "marcus.webb@example.com",
    commentText: null, fieldName: "rowStatus", oldValue: "OPEN", newValue: "DONE",
    createdAt: `${D.DAY06}T07:41:10`,
  },
  {
    activityId: 6, msorId: 3, caseKey: "SKU-0042", entryType: "COMMENT",
    authorName: "Priya Raman", authorEmail: "priya.raman@example.com",
    commentText: "Reorder raised with the supplier; lead time is 3 weeks. Keeping this open until the PO is acknowledged.",
    fieldName: null, oldValue: null, newValue: null, createdAt: `${D.DAY13}T10:05:00`,
  },
  {
    activityId: 8, msorId: 1, caseKey: "ORD-10421", entryType: "COMMENT",
    authorName: "Demo User", authorEmail: "demo@example.com",
    commentText: "Duplicate of the batch we cleared last week — verifying before closing.",
    fieldName: null, oldValue: null, newValue: null, createdAt: `${D.DAY14}T11:30:00`,
  },
];

/** Seed activity counts per case key, so the grid badge matches the timeline length. */
const ACTIVITY_COUNTS: Record<string, number> = BASE_ACTIVITY.reduce<Record<string, number>>(
  (acc, a) => { acc[a.caseKey] = (acc[a.caseKey] ?? 0) + 1; return acc; },
  {},
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _rid = 1;
let _rowid = 1000;

/**
 * The case's stable identity across runs. The real backend derives this from the
 * increment_id, the item's configured identity columns, or (last resort) a hash of
 * the whole row; here the first data column plays that part, which is stable for
 * every fixture because each one leads with its natural key (order / txn / sku id).
 */
function caseKeyOf(data: Record<string, string>): string {
  const first = Object.values(data)[0];
  return first ?? `row-${_rowid}`;
}

function row(
  data: Record<string, string>,
  status: RowStatus = "OPEN",
  comment: string | null = null,
): MonitoringResultRow {
  const rowId = _rowid++;
  const caseKey = caseKeyOf(data);
  return {
    rowId,
    rowStatus: status,
    rowComment: comment,
    caseKey,
    caseKeySource: "IDENTITY_COLUMNS",
    activityCount: ACTIVITY_COUNTS[caseKey] ?? (comment ? 1 : 0),
    data,
  };
}

/**
 * Days a scheduled run of each item looks back, mirroring `default_lookback_days`.
 * The fixtures scan a single day, so begin and end land on the run date itself.
 */
function result(
  msorId: number,
  runDate: string,
  hour: number,
  resultStatus: "SUCCESS" | "FAIL" | "SKIPPED",
  rows: MonitoringResultRow[] = [],
  ms?: number,
  opts: { suppressedCount?: number; pastUnresolved?: boolean } = {},
): MonitoringResult {
  const runAt = `${runDate}T${String(hour).padStart(2, "0")}:00:${String((msorId * 7) % 59).padStart(2, "0")}`;
  const resultId = _rid++;
  const isFail = resultStatus === "FAIL";
  const pastUnresolved = opts.pastUnresolved ?? false;
  return {
    resultId,
    msorId,
    runAt,
    runDate,
    resultCount: rows.length,
    suppressedCount: opts.suppressedCount ?? 0,
    resultStatus,
    executionMs: isFail ? null : (ms ?? 150 + (msorId * 37 + resultId * 11) % 900),
    errorMessage: isFail ? "Connection timeout after 30 000 ms" : null,
    errorDetail: isFail
      ? "com.mysql.cj.jdbc.exceptions.CommunicationsException: Communications link failure\n\tat sun.reflect.GeneratedConstructorAccessor42.newInstance(Unknown Source)\n\tat sun.reflect.DelegatingConstructorAccessorImpl.newInstance(DelegatingConstructorAccessorImpl.java:45)\n\tat java.lang.reflect.Constructor.newInstance(Constructor.java:423)"
      : null,
    // The widened "past unresolved" scan reaches back to the floor instead of the
    // rolling window, and it neither alerts nor syncs.
    beginDate: pastUnresolved ? PAST_UNRESOLVED_FLOOR : runDate,
    endDate: runDate,
    pastUnresolvedYn: pastUnresolved ? "Y" : "N",
    triggeredAlertYn: rows.length > 0 && !pastUnresolved ? "Y" : "N",
    dwSyncedYn: "N",
    createdAt: runAt,
    rows: rows.map((r) => ({ ...r, resultId })),
  };
}


// ---------------------------------------------------------------------------
// msorId 1 — Unfulfilled Orders (weekdays @ 08:00)
// Anomalies on 5 of 10 weekdays; spike mid-week Apr 28-30
// ---------------------------------------------------------------------------
const unfulfilled: MonitoringResult[] = WEEKDAYS.map((date) => {
  const rowData: Record<string, string[][]> = {
    [D.DAY03]: [
      ["ORD-10421", "alice@example.com", `${date} 06:12:05`, "149.99"],
      ["ORD-10398", "bob@example.com",   `${date} 05:44:22`, "79.00"],
    ],
    [D.DAY06]: [
      ["ORD-10512", "dave@example.com",  `${date} 04:00:11`, "312.00"],
      ["ORD-10498", "eve@example.com",   `${date} 03:30:44`, "55.50"],
      ["ORD-10476", "frank@example.com", `${date} 02:15:09`, "99.00"],
      ["ORD-10451", "grace@example.com", `${date} 01:55:33`, "200.00"],
    ],
    [D.DAY07]: [
      ["ORD-10541", "heidi@example.com", `${date} 05:48:02`, "430.00"],
      ["ORD-10529", "ivan@example.com",  `${date} 04:22:17`, "88.75"],
      ["ORD-10518", "judy@example.com",  `${date} 03:01:59`, "177.20"],
    ],
    [D.DAY08]: [
      ["ORD-10580", "karl@example.com",  `${date} 06:10:00`, "64.99"],
      ["ORD-10563", "lena@example.com",  `${date} 05:05:45`, "320.00"],
    ],
    [D.DAY10]: [
      ["ORD-10641", "mike@example.com",  `${date} 05:30:00`, "215.00"],
      ["ORD-10628", "nina@example.com",  `${date} 04:11:33`, "49.99"],
      ["ORD-10614", "otto@example.com",  `${date} 03:44:18`, "130.50"],
    ],
  } as unknown as Record<string, string[][]>;

  const specs = (rowData[date] as unknown as string[][]) ?? [];
  const rows = specs.map(([oid, email, created, amount]) =>
    row({ order_id: oid, customer_email: email, created_at: created, total_amount: amount },
      date < D.DAY08 ? "DONE" : date === D.DAY08 ? "IN_PROGRESS" : "OPEN",
      date < D.DAY08 ? "Escalated to warehouse — resolved" : null,
    )
  );
  return result(1, date, 8, "SUCCESS", rows);
});

// ---------------------------------------------------------------------------
// msorId 2 — Failed Payments (daily @ 07:00)
// Anomalies on 7 of 14 days
// ---------------------------------------------------------------------------
type PayRow = [string, string, string, string];
const paymentAnomalies: Record<string, PayRow[]> = {
  [D.DAY01]: [
    ["TXN-88100", "U-2201", "34.00",  "GATEWAY_TIMEOUT"],
    ["TXN-88097", "U-3344", "220.00", "CARD_DECLINED"],
  ],
  [D.DAY03]: [
    ["TXN-88310", "U-1102", "59.99",  "INSUFFICIENT_FUNDS"],
    ["TXN-88305", "U-5521", "99.00",  "CARD_DECLINED"],
    ["TXN-88290", "U-6677", "15.00",  "CVV_MISMATCH"],
  ],
  [D.DAY06]: [
    ["TXN-88451", "U-4412", "149.00", "CARD_DECLINED"],
    ["TXN-88448", "U-9910", "75.50",  "GATEWAY_ERROR"],
    ["TXN-88440", "U-3303", "310.00", "INSUFFICIENT_FUNDS"],
    ["TXN-88431", "U-7762", "22.00",  "CARD_DECLINED"],
    ["TXN-88419", "U-1188", "480.00", "FRAUD_DETECTED"],
  ],
  [D.DAY07]: [
    ["TXN-88522", "U-2255", "88.00",  "GATEWAY_TIMEOUT"],
    ["TXN-88515", "U-6631", "200.00", "CARD_DECLINED"],
  ],
  [D.DAY09]: [
    ["TXN-88711", "U-8801", "120.00", "GATEWAY_ERROR"],
    ["TXN-88704", "U-4450", "55.00",  "CARD_DECLINED"],
    ["TXN-88698", "U-3320", "399.99", "INSUFFICIENT_FUNDS"],
  ],
  [D.DAY13]: [
    ["TXN-88901", "U-5512", "67.49",  "CARD_DECLINED"],
    ["TXN-88894", "U-7723", "130.00", "CVV_MISMATCH"],
    ["TXN-88881", "U-9900", "250.00", "FRAUD_DETECTED"],
    ["TXN-88870", "U-1145", "44.99",  "INSUFFICIENT_FUNDS"],
  ],
  [D.DAY14]: [
    ["TXN-88970", "U-3381", "180.00", "GATEWAY_TIMEOUT"],
    ["TXN-88962", "U-6644", "29.99",  "CARD_DECLINED"],
  ],
};

const payments: MonitoringResult[] = ALL_DAYS.map((date) => {
  const specs = paymentAnomalies[date] ?? [];
  const rows = specs.map(([txn, uid, amt, code], i) =>
    row(
      { txn_id: txn, user_id: uid, amount: amt, error_code: code, created_at: `${date} 0${i}:${10 + i * 7}:00` },
      date <= D.DAY07 ? "DONE" : date === D.DAY09 ? "IN_PROGRESS" : "OPEN",
      date <= D.DAY07 ? "Investigated — card issuer confirmed" : null,
    )
  );
  return result(2, date, 7, "SUCCESS", rows);
});

// ---------------------------------------------------------------------------
// msorId 3 — Inventory Below Reorder (weekdays @ 06:30)
// Chronic shortage of SKU-0042 and SKU-0118 escalating across the two weeks
// ---------------------------------------------------------------------------
type InvRow = [string, string, string, string];
const inventoryAnomalies: Record<string, InvRow[]> = {
  [D.DAY02]: [
    ["SKU-0042", "Widget Pro", "12", "20"],
  ],
  [D.DAY03]: [
    ["SKU-0042", "Widget Pro", "8",  "20"],
    ["SKU-0118", "Gadget X",   "4",  "10"],
  ],
  [D.DAY06]: [
    ["SKU-0042", "Widget Pro", "5",  "20"],
    ["SKU-0118", "Gadget X",   "2",  "10"],
    ["SKU-0203", "Cable Kit",  "0",  "15"],
  ],
  [D.DAY07]: [
    ["SKU-0042", "Widget Pro", "5",  "20"],
    ["SKU-0203", "Cable Kit",  "0",  "15"],
  ],
  [D.DAY08]: [
    ["SKU-0042", "Widget Pro", "3",  "20"],
    ["SKU-0118", "Gadget X",   "0",  "10"],
    ["SKU-0203", "Cable Kit",  "0",  "15"],
    ["SKU-0311", "Power Pack", "6",  "25"],
  ],
  [D.DAY09]: [
    ["SKU-0042", "Widget Pro", "3",  "20"],
    ["SKU-0311", "Power Pack", "4",  "25"],
  ],
  [D.DAY10]: [
    ["SKU-0042", "Widget Pro", "0",  "20"],
    ["SKU-0118", "Gadget X",   "0",  "10"],
    ["SKU-0311", "Power Pack", "2",  "25"],
    ["SKU-0412", "Lens Cover", "1",  "12"],
  ],
  [D.DAY13]: [
    ["SKU-0042", "Widget Pro", "0",  "20"],
    ["SKU-0412", "Lens Cover", "0",  "12"],
  ],
  [D.DAY14]: [
    ["SKU-0042", "Widget Pro", "0",  "20"],
    ["SKU-0118", "Gadget X",   "0",  "10"],
    ["SKU-0412", "Lens Cover", "0",  "12"],
  ],
};

const inventory: MonitoringResult[] = WEEKDAYS.map((date) => {
  const specs = inventoryAnomalies[date] ?? [];
  const rows = specs.map(([sku, name, qty, rp]) =>
    row(
      { sku, product_name: name, stock_qty: qty, reorder_point: rp },
      date < D.DAY07 ? "IN_PROGRESS" : "OPEN",
      date < D.DAY07 ? "PO raised — awaiting delivery" : null,
    )
  );
  return result(3, date, 6, "SUCCESS", rows);
});

// ---------------------------------------------------------------------------
// msorId 4 — Duplicate Order Items (daily @ 09:00)
// DB connection FAIL on Apr 26; duplicates found on Apr 29 and May 5
// ---------------------------------------------------------------------------
const duplicates: MonitoringResult[] = ALL_DAYS.map((date) => {
  if (date === D.DAY04) return result(4, date, 9, "FAIL");
  if (date === D.DAY07)
    return result(4, date, 9, "SUCCESS", [
      row({ order_id: "ORD-10530", sku: "SKU-0042", cnt: "2" }, "DONE", "Duplicate removed via hotfix"),
      row({ order_id: "ORD-10527", sku: "SKU-0118", cnt: "2" }, "DONE", "Duplicate removed via hotfix"),
    ]);
  if (date === D.DAY13)
    return result(4, date, 9, "SUCCESS", [
      row({ order_id: "ORD-10882", sku: "SKU-0203", cnt: "3" }, "IN_PROGRESS", "Under investigation"),
      row({ order_id: "ORD-10878", sku: "SKU-0311", cnt: "2" }, "OPEN"),
    ]);
  return result(4, date, 9, "SUCCESS", []);
});

// ---------------------------------------------------------------------------
// msorId 5 — Stale Sessions (daily @ 02:00)
// Growing session leak apparent across the second week
// ---------------------------------------------------------------------------
type SessRow = [string, string, string, string];
const sessionAnomalies: Record<string, SessRow[]> = {
  [D.DAY05]: [
    ["sess-aa01", "U-1001", "2025-04-25 22:00:00", "2025-04-25 08:00:00"],
    ["sess-aa02", "U-1042", "2025-04-26 08:30:00", "2025-04-26 07:00:00"],
  ],
  [D.DAY08]: [
    ["sess-bb11", "U-2211", "2025-04-28 20:00:00", "2025-04-28 09:00:00"],
  ],
  [D.DAY09]: [
    ["sess-cc01", "U-3301", "2025-04-29 15:00:00", "2025-04-29 10:00:00"],
    ["sess-cc02", "U-3388", "2025-04-29 16:30:00", "2025-04-29 11:00:00"],
    ["sess-cc03", "U-3412", "2025-04-30 09:00:00", "2025-04-30 08:00:00"],
  ],
  [D.DAY11]: [
    ["sess-dd01", "U-4401", "2025-05-01 10:00:00", "2025-05-01 06:00:00"],
    ["sess-dd02", "U-4477", "2025-05-01 12:00:00", "2025-05-01 07:00:00"],
    ["sess-dd03", "U-4490", "2025-05-02 08:00:00", "2025-05-02 07:00:00"],
    ["sess-dd04", "U-4455", "2025-05-02 09:30:00", "2025-05-02 08:30:00"],
  ],
  [D.DAY13]: [
    ["sess-ee01", "U-5500", "2025-05-03 14:00:00", "2025-05-03 09:00:00"],
    ["sess-ee02", "U-5512", "2025-05-03 15:00:00", "2025-05-03 10:00:00"],
    ["sess-ee03", "U-5530", "2025-05-04 11:00:00", "2025-05-04 09:00:00"],
  ],
  [D.DAY14]: [
    ["sess-ff01", "U-6601", "2025-05-04 20:00:00", "2025-05-04 08:00:00"],
    ["sess-ff02", "U-6622", "2025-05-05 10:00:00", "2025-05-05 07:00:00"],
    ["sess-ff03", "U-6644", "2025-05-05 11:30:00", "2025-05-05 08:00:00"],
    ["sess-ff04", "U-6677", "2025-05-05 14:00:00", "2025-05-05 09:00:00"],
    ["sess-ff05", "U-6699", "2025-05-06 08:00:00", "2025-05-06 06:00:00"],
  ],
};

const sessions: MonitoringResult[] = ALL_DAYS.map((date) => {
  const specs = sessionAnomalies[date] ?? [];
  const rows = specs.map(([sid, uid, last, created]) =>
    row(
      { session_id: sid, user_id: uid, last_activity: last, created_at: created },
      date <= D.DAY09 ? "DONE" : "OPEN",
      date <= D.DAY09 ? "Session force-closed" : null,
    )
  );
  return result(5, date, 2, "SUCCESS", rows);
});

// ---------------------------------------------------------------------------
// msorId 6 — Refunds Without Approval (weekdays @ 08:00)
// ---------------------------------------------------------------------------
type RefRow = [string, string, string, string];
const refundAnomalies: Record<string, RefRow[]> = {
  [D.DAY02]: [
    ["REF-540", "ORD-9900", "29.99",  "agent_5"],
  ],
  [D.DAY07]: [
    ["REF-548", "ORD-9960", "149.00", "agent_2"],
    ["REF-549", "ORD-9971", "75.00",  "agent_9"],
  ],
  [D.DAY08]: [
    ["REF-552", "ORD-9982", "49.99",  "agent_7"],
    ["REF-553", "ORD-9918", "220.00", "agent_3"],
    ["REF-554", "ORD-9934", "89.00",  "agent_1"],
  ],
  [D.DAY09]: [
    ["REF-558", "ORD-10012", "310.00", "agent_4"],
  ],
  [D.DAY13]: [
    ["REF-571", "ORD-10101", "55.00",  "agent_6"],
    ["REF-572", "ORD-10098", "175.00", "agent_2"],
    ["REF-573", "ORD-10090", "400.00", "agent_8"],
  ],
  [D.DAY14]: [
    ["REF-578", "ORD-10141", "99.00",  "agent_5"],
    ["REF-579", "ORD-10138", "230.00", "agent_3"],
  ],
};

const refunds: MonitoringResult[] = WEEKDAYS.map((date) => {
  const specs = refundAnomalies[date] ?? [];
  const rows = specs.map(([rid, oid, amt, agent]) =>
    row(
      { refund_id: rid, order_id: oid, amount: amt, requested_by: agent, created_at: `${date} 07:30:00` },
      date <= D.DAY08 ? "DONE" : date === D.DAY09 ? "IN_PROGRESS" : "OPEN",
      date <= D.DAY08 ? "Approval obtained retroactively" : null,
    )
  );
  return result(6, date, 8, "SUCCESS", rows);
});

// ---------------------------------------------------------------------------
// msorId 7 — Daily Revenue Summary (daily @ 06:00)
// Always exactly one result row with realistic weekend/weekday variation
// ---------------------------------------------------------------------------
const revenueByDate: Record<string, [string, string]> = {
  [D.DAY01]: ["247", "31240.85"],
  [D.DAY02]: ["283", "36812.40"],
  [D.DAY03]: ["261", "33590.10"],
  [D.DAY04]: ["318", "42100.00"],
  [D.DAY05]: ["344", "47880.55"],
  [D.DAY06]: ["229", "28440.20"],
  [D.DAY07]: ["271", "35020.75"],
  [D.DAY08]: ["255", "32180.90"],
  [D.DAY09]: ["290", "38540.00"],
  [D.DAY10]: ["268", "34760.30"],
  [D.DAY11]: ["402", "56440.15"],
  [D.DAY12]: ["378", "51920.70"],
  [D.DAY13]: ["244", "30890.45"],
  [D.DAY14]: ["259", "33210.60"],
};

const revenue: MonitoringResult[] = ALL_DAYS.map((date) => {
  const [count, rev] = revenueByDate[date];
  return result(7, date, 6, "SUCCESS", [
    row({ order_date: date, order_count: count, revenue: rev }),
  ]);
});

// ---------------------------------------------------------------------------
// msorId 8 — Registration Anomalies (sampled hours: 00,06,12,18 daily)
// Bot spikes on Apr 24 evening, Apr 28 midday, May 1 overnight, May 5-6
// ---------------------------------------------------------------------------
type BotRow = [string, string, string]; // ip, count, first_seen
const botAnomalies: Record<string, Record<number, BotRow[]>> = {
  [D.DAY02]: {
    18: [["203.0.113.77", "22", `${D.DAY02} 18:02:00`]],
  },
  [D.DAY06]: {
    12: [
      ["198.51.100.42", "41", `${D.DAY06} 12:01:00`],
      ["203.0.113.14",  "17", `${D.DAY06} 12:03:00`],
    ],
  },
  [D.DAY09]: {
    0: [["192.0.2.200",    "28", `${D.DAY09} 00:04:00`]],
    6: [["198.51.100.99",  "13", `${D.DAY09} 06:08:00`]],
  },
  [D.DAY13]: {
    12: [["203.0.113.201", "34", `${D.DAY13} 12:00:00`]],
    18: [["203.0.113.201", "57", `${D.DAY13} 18:01:00`]],
  },
  [D.DAY14]: {
    0:  [["203.0.113.201", "63", `${D.DAY14} 00:00:00`]],
    6:  [
      ["203.0.113.201", "44", `${D.DAY14} 06:01:00`],
      ["198.51.100.88", "19", `${D.DAY14} 06:02:00`],
    ],
    12: [["198.51.100.88", "31", `${D.DAY14} 12:05:00`]],
  },
};

const registrations: MonitoringResult[] = ALL_DAYS.flatMap((date) =>
  [0, 6, 12, 18].map((hour) => {
    const specs = botAnomalies[date]?.[hour] ?? [];
    const rows = specs.map(([ip, count, first]) =>
      row(
        { ip_address: ip, registrations: count, first_seen: first },
        date < D.DAY13 ? "DONE" : "OPEN",
        date < D.DAY13 ? "IP blocked via firewall rule" : null,
      )
    );
    return result(8, date, hour, "SUCCESS", rows);
  })
);

// ---------------------------------------------------------------------------
// Generated catalogue
// ---------------------------------------------------------------------------
// The eight items above are hand-written, each with a curated anomaly narrative.
// Covering the rest of the taxonomy that way would be a few thousand lines of
// near-identical literals, so the remainder is described by a compact spec and
// expanded at load time.
//
// Everything below is deterministic: each item seeds its own generator from its
// msorId, so a reload reproduces the same fixtures byte for byte and the demo never
// contradicts a screenshot taken from it.
//
// Cases are given a first sighting and a lifespan rather than being sprinkled per
// run. That is what makes a case *recur* across consecutive runs — the whole premise
// of case tracking, and what lets the Case Age pie, the First Seen column, and the
// suppressed count each show something truthful rather than decorative.

interface GenSpec {
  title: string;
  description: string;
  category: string;
  dbType: string;
  /** Case identity prefix, e.g. `ORD` → `ORD-48213`. */
  keyPrefix: string;
  /** Result columns. The first is the case's natural key. */
  columns: string[];
  /** Closed value sets for status-like columns; anything else is inferred by name. */
  enums?: Record<string, string[]>;
  sql: string;
  cron: string;
  owner: string;
  ownerEmail: string;
  recipients: string;
  frequent?: boolean;
  onHold?: boolean;
  /** Whether the SQL takes @begin_date/@end_date. Drives the scan-range controls. */
  windowed?: boolean;
  lookback?: number;
  cadence?: "weekdays" | "all";
  cases?: number;
  /** Spine index whose run fails, so the board keeps some genuine red on it. */
  failDay?: number;
}

/** xorshift32 — small, stable, and spread enough for fixtures. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

const pickOf = <T>(rng: () => number, xs: T[]): T => xs[Math.floor(rng() * xs.length) % xs.length];
const between = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pad2 = (n: number) => String(n).padStart(2, "0");

const GEN_PEOPLE = ["alice", "bob", "carla", "dan", "erin", "farid", "gina", "hugo"];
const GEN_PLACES = ["north", "south", "harbour", "central", "riverside", "eastgate"];

/** A plausible value for a column, inferred from its name unless the spec pins it. */
function cellValue(col: string, rng: () => number, day: string, spec: GenSpec): string {
  const fixed = spec.enums?.[col];
  if (fixed) return pickOf(rng, fixed);
  if (/_at$|_date$|_time$/.test(col)) {
    return `${day} ${pad2(between(rng, 0, 23))}:${pad2(between(rng, 0, 59))}:${pad2(between(rng, 0, 59))}`;
  }
  if (/amount|total|price|value|revenue|balance|payout|spend/.test(col)) {
    return (between(rng, 5, 3800) + Math.round(rng() * 99) / 100).toFixed(2);
  }
  if (/latency|_ms$|duration/.test(col)) return String(between(rng, 250, 9800));
  if (/qty|count|attempts|retries|points|age|days|rate|threshold/.test(col)) return String(between(rng, 1, 180));
  if (/email/.test(col)) return `${pickOf(rng, GEN_PEOPLE)}@example.com`;
  if (/sku/.test(col)) return `SKU-${String(between(rng, 1, 9999)).padStart(4, "0")}`;
  if (/serial/.test(col)) return `SN${between(rng, 1000000, 9999999)}`;
  if (/member|customer|user/.test(col)) return `U-${between(rng, 1000, 9999)}`;
  if (/vendor|partner|store|warehouse/.test(col)) return `${pickOf(rng, GEN_PLACES)}-${between(rng, 10, 99)}`;
  if (/product_name/.test(col)) return `${pickOf(rng, ["Widget", "Gadget", "Cable", "Bracket", "Adapter"])} ${pickOf(rng, ["Pro", "Mini", "Max", "Lite"])}`;
  if (/_id$|_ref$|_no$/.test(col)) return String(between(rng, 100000, 999999));
  return `${col.replace(/_/g, " ")} ${between(rng, 1, 99)}`;
}

/** Who the generated triage is attributed to, so the KPI page has a real spread. */
const GEN_AUTHORS: { name: string; email: string }[] = [
  { name: "Priya Raman", email: "priya.raman@example.com" },
  { name: "Marcus Webb", email: "marcus.webb@example.com" },
  { name: "Demo User", email: "demo@example.com" },
  { name: "Lena Fischer", email: "lena.fischer@example.com" },
  { name: "Tomas Alvarez", email: "tomas.alvarez@example.com" },
];

const GEN_COMMENTS = [
  "Raised with the owning team; waiting on their next release.",
  "Reproduced in staging — the upstream feed is arriving a field short.",
  "Transient. Cleared on the following run, keeping an eye on it.",
  "Root cause is a stale mapping row; correction queued for tonight.",
  "Confirmed expected during the migration window. Closing.",
  "Chased the partner; they have acknowledged and are redriving.",
];

const GEN_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#64748b", "#0ea5e9",
];

let _genActivityId = 10000;

interface GenCase {
  key: string;
  data: Record<string, string>;
  from: number;
  to: number;
  status: RowStatus;
  comment: string | null;
  activityCount: number;
}

function generateItem(spec: GenSpec, msorId: number): {
  query: MonitoringQuery;
  results: MonitoringResult[];
  activity: MockActivity[];
} {
  const rng = seeded(msorId * 7919 + 13);
  const days = (spec.cadence ?? "weekdays") === "all" ? ALL_DAYS : WEEKDAYS;
  const total = spec.cases ?? between(rng, 5, 13);

  const cases: GenCase[] = [];
  const activity: MockActivity[] = [];

  for (let c = 0; c < total; c++) {
    const from = Math.floor(rng() * days.length);
    // Roughly two in five cases are still recurring on the last day of the window, so the
    // board keeps a working amount of open triage rather than reading as a mostly-closed
    // archive. Letting the lifespan fall where it may put ~85% of cases in the past.
    const to = rng() < 0.42
      ? days.length - 1
      : Math.min(days.length - 1, from + between(rng, 0, 4));
    const firstDay = days[from];
    const key = `${spec.keyPrefix}-${between(rng, 10000, 99999)}`;

    const data: Record<string, string> = { [spec.columns[0]]: key };
    for (const col of spec.columns.slice(1)) data[col] = cellValue(col, rng, firstDay, spec);

    // A case that stopped recurring before the end of the window is one somebody dealt
    // with; one still recurring on the last day is still outstanding.
    const resolved = to < days.length - 1;
    const status: RowStatus = resolved ? "DONE" : (rng() < 0.25 ? "IN_PROGRESS" : "OPEN");

    let comment: string | null = null;
    let activityCount = 0;

    if (rng() < 0.28) {
      const who = pickOf(rng, GEN_AUTHORS);
      const stamp = `${days[to]}T${pad2(between(rng, 8, 17))}:${pad2(between(rng, 0, 59))}:00`;
      comment = pickOf(rng, GEN_COMMENTS);
      activity.push({
        activityId: _genActivityId++, msorId, caseKey: key,
        entryType: "COMMENT", authorName: who.name, authorEmail: who.email,
        commentText: comment, fieldName: null, oldValue: null, newValue: null,
        createdAt: stamp,
      });
      activityCount = 1;
      if (status !== "OPEN") {
        activity.push({
          activityId: _genActivityId++, msorId, caseKey: key,
          entryType: "STATUS_CHANGE", authorName: who.name, authorEmail: who.email,
          commentText: null, fieldName: "rowStatus", oldValue: "OPEN", newValue: status,
          createdAt: `${stamp.slice(0, 16)}:30`,
        });
        activityCount = 2;
      }
    }

    cases.push({ key, data, from, to, status, comment, activityCount });
  }

  const results: MonitoringResult[] = days.map((date, dayIdx) => {
    if (spec.failDay === dayIdx) return result(msorId, date, 7, "FAIL", []);

    const live = cases.filter((c) => dayIdx >= c.from && dayIdx <= c.to);
    // A case already marked DONE is withheld from every later run rather than
    // re-reported; that withholding is exactly what suppressedCount records.
    const suppressed = cases.filter((c) => c.status === "DONE" && dayIdx > c.to).length;

    const rows: MonitoringResultRow[] = live.map((c) => ({
      rowId: _rowid++,
      rowStatus: c.status,
      rowComment: c.comment,
      caseKey: c.key,
      caseKeySource: "IDENTITY_COLUMNS",
      activityCount: c.activityCount,
      data: c.data,
    }));

    return result(msorId, date, 7, "SUCCESS", rows, undefined, { suppressedCount: suppressed });
  });

  const query: MonitoringQuery = {
    msorId,
    title: spec.title,
    description: spec.description,
    dbType: spec.dbType,
    category: spec.category,
    sqlQuery: spec.sql,
    queryInterval: spec.cron,
    sheetName: spec.title,
    ownerName: spec.owner,
    ownerEmail: spec.ownerEmail,
    recipients: spec.recipients,
    activeYn: "Y",
    frequentYn: spec.frequent ? "Y" : "N",
    onHoldYn: spec.onHold ? "Y" : "N",
    dateRangeSupported: spec.windowed ?? true,
    defaultLookbackDays: spec.lookback ?? 7,
    color: GEN_COLORS[msorId % GEN_COLORS.length],
    createdAt: "2025-02-01T09:00:00",
    updatedAt: "2025-04-18T15:30:00",
  };

  return { query, results, activity };
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------
// Every bucket in the dashboard taxonomy carries at least three items, so the
// sidebar, the category pies, and the per-category pages all have something to show.

const GEN_SPECS: GenSpec[] = [
  // ── PG / Payment ────────────────────────────────────────────────────────
  {
    title: "Authorization Expired Before Capture", category: "PG / Payment", dbType: "DATABASE2",
    description: "Payment authorizations that lapsed before the order was captured, leaving the order unpayable.",
    keyPrefix: "AUTH", columns: ["auth_ref", "order_id", "amount", "gateway", "authorized_at"],
    enums: { gateway: ["ADYEN", "BRAINTREE", "STRIPE", "WORLDPAY"] },
    sql: "SELECT auth_ref, order_id, amount, gateway, authorized_at\nFROM payment_authorizations\nWHERE captured_at IS NULL\n  AND expires_at < NOW()\n  AND authorized_at >= @begin_date\n  AND authorized_at <  @end_date",
    cron: "0 0 7 * * *", owner: "Finance Team", ownerEmail: "finance@example.com",
    recipients: "finance@example.com,ops@example.com", lookback: 3,
  },
  {
    title: "Settlement File Mismatch", category: "PG / Payment", dbType: "DATABASE2",
    description: "Captured amounts that disagree with the settlement file the gateway delivered.",
    keyPrefix: "STL", columns: ["settlement_ref", "order_id", "captured_amount", "settled_amount", "gateway", "settled_at"],
    enums: { gateway: ["ADYEN", "BRAINTREE", "STRIPE"] },
    sql: "SELECT settlement_ref, order_id, captured_amount, settled_amount, gateway, settled_at\nFROM settlements\nWHERE captured_amount <> settled_amount\n  AND settled_at >= @begin_date\n  AND settled_at <  @end_date",
    cron: "0 30 6 * * MON-FRI", owner: "Finance Team", ownerEmail: "finance@example.com",
    recipients: "finance@example.com", lookback: 5, cases: 9,
  },

  // ── Reward ──────────────────────────────────────────────────────────────
  {
    title: "Points Accrual Failures", category: "Reward", dbType: "DATABASE4",
    description: "Completed orders whose loyalty points were never credited to the member.",
    keyPrefix: "ACR", columns: ["accrual_ref", "member_id", "order_id", "points", "failure_reason", "created_at"],
    enums: { failure_reason: ["MEMBER_NOT_FOUND", "TIER_LOOKUP_FAILED", "RULE_ENGINE_TIMEOUT", "DUPLICATE_ACCRUAL"] },
    sql: "SELECT accrual_ref, member_id, order_id, points, failure_reason, created_at\nFROM reward_accruals\nWHERE status = 'FAILED'\n  AND created_at >= @begin_date\n  AND created_at <  @end_date",
    cron: "0 0 8 * * *", owner: "Loyalty Team", ownerEmail: "loyalty@example.com",
    recipients: "loyalty@example.com,ops@example.com", cadence: "all", cases: 12,
  },
  {
    title: "Redemption Balance Mismatch", category: "Reward", dbType: "DATABASE4",
    description: "Members whose ledger balance disagrees with the sum of their accrual and redemption rows.",
    keyPrefix: "BAL", columns: ["member_id", "ledger_balance", "computed_balance", "last_movement_at"],
    sql: "SELECT member_id, ledger_balance, computed_balance, last_movement_at\nFROM reward_balances\nWHERE ledger_balance <> computed_balance",
    cron: "0 0 5 * * MON", owner: "Loyalty Team", ownerEmail: "loyalty@example.com",
    recipients: "loyalty@example.com", windowed: false, lookback: 7, cases: 6,
  },
  {
    title: "Expired Points Not Swept", category: "Reward", dbType: "DATABASE4",
    description: "Points past their expiry date that the nightly sweep left on the member's balance.",
    keyPrefix: "EXP", columns: ["accrual_ref", "member_id", "points", "expires_at"],
    sql: "SELECT accrual_ref, member_id, points, expires_at\nFROM reward_accruals\nWHERE expires_at < CURDATE()\n  AND swept_at IS NULL",
    cron: "0 0 4 * * *", owner: "Loyalty Team", ownerEmail: "loyalty@example.com",
    recipients: "loyalty@example.com", windowed: false, lookback: 14, cases: 7, failDay: 4,
  },

  // ── Order Delivery ──────────────────────────────────────────────────────
  {
    title: "Shipment Missing Tracking Number", category: "Order Delivery", dbType: "DATABASE1",
    description: "Shipments marked dispatched by the warehouse but carrying no carrier tracking reference.",
    keyPrefix: "SHP", columns: ["shipment_ref", "order_id", "carrier", "warehouse_code", "dispatched_at"],
    enums: { carrier: ["UPS", "FEDEX", "DHL", "USPS"] },
    sql: "SELECT shipment_ref, order_id, carrier, warehouse_code, dispatched_at\nFROM shipments\nWHERE tracking_number IS NULL\n  AND dispatched_at >= @begin_date\n  AND dispatched_at <  @end_date",
    cron: "0 0 9 * * *", owner: "Logistics", ownerEmail: "logistics@example.com",
    recipients: "logistics@example.com,ops@example.com", cadence: "all", lookback: 3, cases: 11,
  },
  {
    title: "Delivery Past Promised Date", category: "Order Delivery", dbType: "DATABASE1",
    description: "In-flight shipments that have passed the delivery date promised to the customer.",
    keyPrefix: "LATE", columns: ["shipment_ref", "order_id", "promised_date", "carrier", "days_overdue"],
    enums: { carrier: ["UPS", "FEDEX", "DHL"] },
    sql: "SELECT shipment_ref, order_id, promised_date, carrier,\n       DATEDIFF(CURDATE(), promised_date) AS days_overdue\nFROM shipments\nWHERE delivered_at IS NULL\n  AND promised_date < CURDATE()",
    cron: "0 0 10 * * *", owner: "Logistics", ownerEmail: "logistics@example.com",
    recipients: "logistics@example.com", windowed: false, lookback: 5, cases: 10,
  },

  // ── Order Validation ────────────────────────────────────────────────────
  {
    title: "Orders Missing Line Items", category: "Order Validation", dbType: "DATABASE1",
    description: "Orders that reached a payable state with no line items attached.",
    keyPrefix: "ORDV", columns: ["order_id", "customer_email", "order_total", "status", "created_at"],
    enums: { status: ["PROCESSING", "PENDING_PAYMENT", "COMPLETE"] },
    sql: "SELECT o.order_id, o.customer_email, o.order_total, o.status, o.created_at\nFROM orders o\nLEFT JOIN order_items i ON i.order_id = o.order_id\nWHERE i.id IS NULL\n  AND o.created_at >= @begin_date\n  AND o.created_at <  @end_date",
    cron: "0 15 8 * * *", owner: "Data Quality", ownerEmail: "dq@example.com",
    recipients: "dq@example.com", lookback: 2, cases: 6,
  },
  {
    title: "Address Validation Failures", category: "Order Validation", dbType: "DATABASE1",
    description: "Shipping addresses the validation service rejected but which were accepted onto the order anyway.",
    keyPrefix: "ADDR", columns: ["address_ref", "order_id", "country", "failure_code", "created_at"],
    enums: { country: ["US", "CA", "MX"], failure_code: ["POSTCODE_MISMATCH", "UNKNOWN_STREET", "PO_BOX_REJECTED", "SERVICE_TIMEOUT"] },
    sql: "SELECT address_ref, order_id, country, failure_code, created_at\nFROM address_validations\nWHERE result = 'FAILED'\n  AND overridden = 1\n  AND created_at >= @begin_date\n  AND created_at <  @end_date",
    cron: "0 45 8 * * MON-FRI", owner: "Data Quality", ownerEmail: "dq@example.com",
    recipients: "dq@example.com,ops@example.com", lookback: 3, cases: 8,
  },

  // ── BOPIS ───────────────────────────────────────────────────────────────
  {
    title: "Pickup Not Collected (>7d)", category: "BOPIS", dbType: "DATABASE1",
    description: "Store pickup orders that have been ready for collection for more than seven days.",
    keyPrefix: "PU", columns: ["pickup_ref", "order_id", "store_code", "ready_at", "days_waiting"],
    sql: "SELECT pickup_ref, order_id, store_code, ready_at,\n       DATEDIFF(CURDATE(), DATE(ready_at)) AS days_waiting\nFROM store_pickups\nWHERE collected_at IS NULL\n  AND ready_at < NOW() - INTERVAL 7 DAY",
    cron: "0 0 11 * * *", owner: "Retail Ops", ownerEmail: "retail@example.com",
    recipients: "retail@example.com", windowed: false, lookback: 10, cases: 9,
  },
  {
    title: "Store Reservation Expired", category: "BOPIS", dbType: "DATABASE1",
    description: "Inventory reservations that lapsed while the pickup order was still open.",
    keyPrefix: "RSV", columns: ["reservation_ref", "order_id", "store_code", "sku", "expired_at"],
    sql: "SELECT reservation_ref, order_id, store_code, sku, expired_at\nFROM store_reservations\nWHERE status = 'EXPIRED'\n  AND expired_at >= @begin_date\n  AND expired_at <  @end_date",
    cron: "0 20 9 * * *", owner: "Retail Ops", ownerEmail: "retail@example.com",
    recipients: "retail@example.com,ops@example.com", cadence: "all", lookback: 4, cases: 12,
  },
  {
    title: "Pickup Ready Notification Failed", category: "BOPIS", dbType: "DATABASE1",
    description: "Ready-for-collection notifications the messaging service never delivered.",
    keyPrefix: "NTF", columns: ["notification_ref", "order_id", "channel", "failure_code", "attempts", "created_at"],
    enums: { channel: ["EMAIL", "SMS", "PUSH"], failure_code: ["HARD_BOUNCE", "INVALID_NUMBER", "PROVIDER_5XX", "OPTED_OUT"] },
    sql: "SELECT notification_ref, order_id, channel, failure_code, attempts, created_at\nFROM pickup_notifications\nWHERE status = 'FAILED'\n  AND created_at >= @begin_date\n  AND created_at <  @end_date",
    cron: "0 40 9 * * *", owner: "Retail Ops", ownerEmail: "retail@example.com",
    recipients: "retail@example.com", lookback: 3, cases: 7,
  },

  // ── Cancel / Refund ─────────────────────────────────────────────────────
  {
    title: "Cancelled Orders Still Shipping", category: "Cancel / Refund", dbType: "DATABASE1",
    description: "Orders cancelled after the warehouse had already dispatched them.",
    keyPrefix: "CXL", columns: ["order_id", "shipment_ref", "cancelled_at", "dispatched_at", "order_total"],
    sql: "SELECT o.order_id, s.shipment_ref, o.cancelled_at, s.dispatched_at, o.order_total\nFROM orders o\nJOIN shipments s ON s.order_id = o.order_id\nWHERE o.status = 'CANCELLED'\n  AND s.dispatched_at IS NOT NULL\n  AND o.cancelled_at >= @begin_date\n  AND o.cancelled_at <  @end_date",
    cron: "0 0 8 * * *", owner: "Customer Care", ownerEmail: "care@example.com",
    recipients: "care@example.com,logistics@example.com", lookback: 5, cases: 8,
  },
  {
    title: "Partial Refund Rounding Gaps", category: "Cancel / Refund", dbType: "DATABASE2",
    description: "Partially refunded orders where the refunded lines do not sum to the refund issued.",
    keyPrefix: "RFD", columns: ["refund_ref", "order_id", "line_total", "refund_total", "variance", "created_at"],
    sql: "SELECT refund_ref, order_id, line_total, refund_total,\n       ROUND(refund_total - line_total, 2) AS variance, created_at\nFROM refunds\nWHERE refund_type = 'PARTIAL'\n  AND ABS(refund_total - line_total) > 0.01\n  AND created_at >= @begin_date\n  AND created_at <  @end_date",
    cron: "0 10 8 * * MON-FRI", owner: "Finance Team", ownerEmail: "finance@example.com",
    recipients: "finance@example.com,compliance@example.com", lookback: 7, cases: 6,
  },

  // ── Export & ERP I/F ────────────────────────────────────────────────────
  {
    title: "ERP Export Batch Failures", category: "Export & ERP I/F", dbType: "DATABASE3",
    description: "Export batches the ERP interface rejected, holding up downstream financial posting.",
    keyPrefix: "BATCH", columns: ["batch_ref", "interface_name", "record_count", "error_text", "transfer_date"],
    enums: { interface_name: ["ORDER_IF", "INVOICE_IF", "CREDIT_IF", "ITEM_IF"] },
    sql: "SELECT batch_ref, interface_name, record_count, error_text, transfer_date\nFROM export_batches\nWHERE status_code = 'E'\n  AND transfer_date >= @begin_date\n  AND transfer_date <  @end_date",
    cron: "0 30 7 * * *", owner: "Integration", ownerEmail: "integration@example.com",
    recipients: "integration@example.com,ops@example.com", cadence: "all", lookback: 3, cases: 11, failDay: 9,
  },
  {
    title: "Invoice Export Backlog", category: "Export & ERP I/F", dbType: "DATABASE3",
    description: "Invoices queued for export that have not transferred within their SLA.",
    keyPrefix: "INV", columns: ["invoice_ref", "order_id", "queued_at", "age_hours", "amount"],
    sql: "SELECT invoice_ref, order_id, queued_at,\n       TIMESTAMPDIFF(HOUR, queued_at, NOW()) AS age_hours, amount\nFROM invoice_export_queue\nWHERE transferred_at IS NULL\n  AND queued_at < NOW() - INTERVAL 6 HOUR",
    cron: "0 0 */4 * * *", owner: "Integration", ownerEmail: "integration@example.com",
    recipients: "integration@example.com", windowed: false, lookback: 2, frequent: true, cases: 9,
  },

  // ── Interface Health ────────────────────────────────────────────────────
  {
    title: "Interface Latency Breaches", category: "Interface Health", dbType: "DATABASE3",
    description: "Interface calls whose round trip exceeded the agreed latency budget.",
    keyPrefix: "LAT", columns: ["call_ref", "interface_name", "latency_ms", "threshold_ms", "called_at"],
    enums: { interface_name: ["ORDER_IF", "STOCK_IF", "PRICE_IF", "CUSTOMER_IF"] },
    sql: "SELECT call_ref, interface_name, latency_ms, threshold_ms, called_at\nFROM interface_calls\nWHERE latency_ms > threshold_ms\n  AND called_at >= @begin_date\n  AND called_at <  @end_date",
    cron: "0 0 * * * *", owner: "Platform Team", ownerEmail: "platform@example.com",
    recipients: "platform@example.com", cadence: "all", frequent: true, lookback: 1, cases: 14,
  },
  {
    title: "Webhook Retry Exhaustion", category: "Interface Health", dbType: "DATABASE3",
    description: "Outbound webhooks that used every retry and were finally abandoned.",
    keyPrefix: "HOOK", columns: ["webhook_ref", "endpoint", "http_status", "retries", "last_attempt_at"],
    enums: { endpoint: ["/orders", "/inventory", "/returns", "/customers"], http_status: ["500", "502", "504", "408"] },
    sql: "SELECT webhook_ref, endpoint, http_status, retries, last_attempt_at\nFROM webhook_deliveries\nWHERE status = 'EXHAUSTED'\n  AND last_attempt_at >= @begin_date\n  AND last_attempt_at <  @end_date",
    cron: "0 0 6 * * *", owner: "Platform Team", ownerEmail: "platform@example.com",
    recipients: "platform@example.com,ops@example.com", lookback: 2, cases: 8,
  },

  // ── Marketplace ─────────────────────────────────────────────────────────
  {
    title: "Vendor Listing Sync Failures", category: "Marketplace", dbType: "DATABASE1",
    description: "Vendor catalogue listings that failed to synchronise to the storefront.",
    keyPrefix: "LST", columns: ["listing_ref", "vendor_code", "sku", "failure_code", "synced_at"],
    enums: { failure_code: ["MISSING_PRICE", "IMAGE_REJECTED", "CATEGORY_UNMAPPED", "DUPLICATE_SKU"] },
    sql: "SELECT listing_ref, vendor_code, sku, failure_code, synced_at\nFROM vendor_listings\nWHERE sync_status = 'FAILED'\n  AND synced_at >= @begin_date\n  AND synced_at <  @end_date",
    cron: "0 0 7 * * *", owner: "Marketplace Ops", ownerEmail: "marketplace@example.com",
    recipients: "marketplace@example.com", cadence: "all", lookback: 3, cases: 13,
  },
  {
    title: "Marketplace Order Import Gaps", category: "Marketplace", dbType: "DATABASE1",
    description: "Marketplace orders acknowledged upstream but never imported into the order system.",
    keyPrefix: "MKT", columns: ["marketplace_ref", "vendor_code", "order_total", "acknowledged_at"],
    sql: "SELECT marketplace_ref, vendor_code, order_total, acknowledged_at\nFROM marketplace_orders\nWHERE imported_at IS NULL\n  AND acknowledged_at >= @begin_date\n  AND acknowledged_at <  @end_date",
    cron: "0 20 7 * * *", owner: "Marketplace Ops", ownerEmail: "marketplace@example.com",
    recipients: "marketplace@example.com,ops@example.com", lookback: 4, cases: 7,
  },
  {
    title: "Vendor Payout Discrepancies", category: "Marketplace", dbType: "DATABASE2",
    description: "Vendor payouts that disagree with the commission the platform calculated.",
    keyPrefix: "PAY", columns: ["payout_ref", "vendor_code", "expected_payout", "actual_payout", "period_end_date"],
    sql: "SELECT payout_ref, vendor_code, expected_payout, actual_payout, period_end_date\nFROM vendor_payouts\nWHERE ABS(expected_payout - actual_payout) > 0.05",
    cron: "0 0 6 * * MON", owner: "Finance Team", ownerEmail: "finance@example.com",
    recipients: "finance@example.com,marketplace@example.com", windowed: false, lookback: 14, cases: 5,
  },

  // ── ESP ─────────────────────────────────────────────────────────────────
  {
    title: "Email Bounce Rate Spike", category: "ESP", dbType: "DATABASE3",
    description: "Campaign sends whose hard-bounce rate exceeded the deliverability threshold.",
    keyPrefix: "CMP", columns: ["campaign_ref", "template_code", "sent_count", "bounce_rate", "sent_at"],
    sql: "SELECT campaign_ref, template_code, sent_count, bounce_rate, sent_at\nFROM esp_campaigns\nWHERE bounce_rate > 5\n  AND sent_at >= @begin_date\n  AND sent_at <  @end_date",
    cron: "0 0 9 * * *", owner: "CRM Team", ownerEmail: "crm@example.com",
    recipients: "crm@example.com", lookback: 3, cases: 6,
  },
  {
    title: "Template Render Failures", category: "ESP", dbType: "DATABASE3",
    description: "Transactional messages the provider could not render, so nothing was sent.",
    keyPrefix: "TPL", columns: ["render_ref", "template_code", "failure_code", "recipient_email", "created_at"],
    enums: { failure_code: ["MISSING_VARIABLE", "MALFORMED_HTML", "ASSET_404", "LOCALE_MISSING"] },
    sql: "SELECT render_ref, template_code, failure_code, recipient_email, created_at\nFROM esp_renders\nWHERE status = 'FAILED'\n  AND created_at >= @begin_date\n  AND created_at <  @end_date",
    cron: "0 30 8 * * *", owner: "CRM Team", ownerEmail: "crm@example.com",
    recipients: "crm@example.com,ops@example.com", cadence: "all", lookback: 2, cases: 10,
  },
  {
    title: "Unsubscribe Sync Lag", category: "ESP", dbType: "DATABASE3",
    description: "Unsubscribes recorded at the provider that have not propagated back to the profile store.",
    keyPrefix: "UNS", columns: ["unsubscribe_ref", "recipient_email", "recorded_at", "age_hours"],
    sql: "SELECT unsubscribe_ref, recipient_email, recorded_at,\n       TIMESTAMPDIFF(HOUR, recorded_at, NOW()) AS age_hours\nFROM esp_unsubscribes\nWHERE synced_at IS NULL\n  AND recorded_at < NOW() - INTERVAL 12 HOUR",
    cron: "0 0 12 * * *", owner: "CRM Team", ownerEmail: "crm@example.com",
    recipients: "crm@example.com,compliance@example.com", windowed: false, lookback: 3, onHold: true, cases: 5,
  },

  // ── TPA ─────────────────────────────────────────────────────────────────
  {
    title: "Partner API Auth Failures", category: "TPA", dbType: "DATABASE3",
    description: "Third-party partner calls rejected on authentication, usually an expired credential.",
    keyPrefix: "TPA", columns: ["call_ref", "partner_code", "http_status", "failure_code", "called_at"],
    enums: { http_status: ["401", "403"], failure_code: ["TOKEN_EXPIRED", "SIGNATURE_INVALID", "IP_NOT_ALLOWED", "SCOPE_MISSING"] },
    sql: "SELECT call_ref, partner_code, http_status, failure_code, called_at\nFROM partner_calls\nWHERE http_status IN (401, 403)\n  AND called_at >= @begin_date\n  AND called_at <  @end_date",
    cron: "0 0 7 * * *", owner: "Integration", ownerEmail: "integration@example.com",
    recipients: "integration@example.com", cadence: "all", lookback: 2, cases: 9,
  },
  {
    title: "Partner Feed Staleness", category: "TPA", dbType: "DATABASE3",
    description: "Partner feeds that have not delivered a file within their contracted window.",
    keyPrefix: "FEED", columns: ["feed_ref", "partner_code", "last_received_at", "age_hours", "sla_hours"],
    sql: "SELECT feed_ref, partner_code, last_received_at,\n       TIMESTAMPDIFF(HOUR, last_received_at, NOW()) AS age_hours, sla_hours\nFROM partner_feeds\nWHERE TIMESTAMPDIFF(HOUR, last_received_at, NOW()) > sla_hours",
    cron: "0 0 8 * * *", owner: "Integration", ownerEmail: "integration@example.com",
    recipients: "integration@example.com,ops@example.com", windowed: false, lookback: 2, cases: 6,
  },
  {
    title: "Partner Order Acknowledgement Missing", category: "TPA", dbType: "DATABASE3",
    description: "Orders dispatched to a partner that were never acknowledged back.",
    keyPrefix: "ACK", columns: ["dispatch_ref", "partner_code", "order_id", "dispatched_at"],
    sql: "SELECT dispatch_ref, partner_code, order_id, dispatched_at\nFROM partner_dispatches\nWHERE acknowledged_at IS NULL\n  AND dispatched_at >= @begin_date\n  AND dispatched_at <  @end_date",
    cron: "0 15 8 * * MON-FRI", owner: "Integration", ownerEmail: "integration@example.com",
    recipients: "integration@example.com", lookback: 4, cases: 8,
  },

  // ── Membership ──────────────────────────────────────────────────────────
  {
    title: "Tier Downgrade Anomalies", category: "Membership", dbType: "DATABASE4",
    description: "Members downgraded a tier despite qualifying spend in the assessment period.",
    keyPrefix: "TIER", columns: ["assessment_ref", "member_id", "old_tier", "new_tier", "qualifying_spend", "assessed_at"],
    enums: { old_tier: ["GOLD", "PLATINUM", "SILVER"], new_tier: ["SILVER", "BRONZE", "GOLD"] },
    sql: "SELECT assessment_ref, member_id, old_tier, new_tier, qualifying_spend, assessed_at\nFROM tier_assessments\nWHERE direction = 'DOWN'\n  AND qualifying_spend >= tier_threshold\n  AND assessed_at >= @begin_date\n  AND assessed_at <  @end_date",
    cron: "0 0 6 * * MON", owner: "Loyalty Team", ownerEmail: "loyalty@example.com",
    recipients: "loyalty@example.com", lookback: 10, cases: 5,
  },
  {
    title: "Duplicate Member Profiles", category: "Membership", dbType: "DATABASE4",
    description: "Multiple active member profiles sharing one email address.",
    keyPrefix: "DUPM", columns: ["member_id", "email", "profile_count", "created_at"],
    sql: "SELECT MIN(member_id) AS member_id, email, COUNT(*) AS profile_count, MIN(created_at) AS created_at\nFROM members\nWHERE active = 1\nGROUP BY email\nHAVING profile_count > 1",
    cron: "0 0 5 * * *", owner: "Data Quality", ownerEmail: "dq@example.com",
    recipients: "dq@example.com,loyalty@example.com", windowed: false, lookback: 7, cases: 7,
  },

  // ── Service ─────────────────────────────────────────────────────────────
  {
    title: "Service Claims Without Resolution", category: "Service", dbType: "DATABASE1",
    description: "After-sales service claims left open past their resolution SLA.",
    keyPrefix: "CLM", columns: ["claim_ref", "order_id", "claim_type", "opened_at", "days_open"],
    enums: { claim_type: ["DAMAGE", "MISSING_PART", "INSTALL_FAULT", "WARRANTY"] },
    sql: "SELECT claim_ref, order_id, claim_type, opened_at,\n       DATEDIFF(CURDATE(), DATE(opened_at)) AS days_open\nFROM service_claims\nWHERE resolved_at IS NULL\n  AND opened_at < NOW() - INTERVAL 5 DAY",
    cron: "0 0 9 * * MON-FRI", owner: "Customer Care", ownerEmail: "care@example.com",
    recipients: "care@example.com", windowed: false, lookback: 10, cases: 10,
  },
  {
    title: "Warranty Lookup Failures", category: "Service", dbType: "DATABASE3",
    description: "Warranty entitlement lookups the service registry could not answer.",
    keyPrefix: "WTY", columns: ["lookup_ref", "serial_no", "failure_code", "called_at"],
    enums: { failure_code: ["SERIAL_NOT_FOUND", "REGISTRY_TIMEOUT", "MODEL_UNMAPPED"] },
    sql: "SELECT lookup_ref, serial_no, failure_code, called_at\nFROM warranty_lookups\nWHERE status = 'FAILED'\n  AND called_at >= @begin_date\n  AND called_at <  @end_date",
    cron: "0 30 9 * * *", owner: "Customer Care", ownerEmail: "care@example.com",
    recipients: "care@example.com,platform@example.com", cadence: "all", lookback: 3, cases: 9,
  },

  // ── Other ───────────────────────────────────────────────────────────────
  {
    title: "Orphaned Order Records", category: "Other", dbType: "DATABASE1",
    description: "Child records left behind pointing at an order that no longer exists.",
    keyPrefix: "ORPH", columns: ["record_id", "table_name", "order_id", "created_at"],
    enums: { table_name: ["order_items", "order_addresses", "order_payments", "order_notes"] },
    sql: "SELECT record_id, table_name, order_id, created_at\nFROM orphaned_records\nWHERE resolved = 0",
    cron: "0 0 3 * * SUN", owner: "Data Quality", ownerEmail: "dq@example.com",
    recipients: "dq@example.com", windowed: false, lookback: 30, cases: 6,
  },
  {
    title: "Unmapped Product Categories", category: "Other", dbType: "DATABASE1",
    description: "Active products whose category has no mapping in the reporting taxonomy.",
    keyPrefix: "CAT", columns: ["sku", "product_name", "source_category", "created_at"],
    sql: "SELECT sku, product_name, source_category, created_at\nFROM products\nWHERE active = 1\n  AND mapped_category IS NULL",
    cron: "0 0 4 * * MON", owner: "Data Quality", ownerEmail: "dq@example.com",
    recipients: "dq@example.com,marketplace@example.com", windowed: false, lookback: 14, cases: 8,
  },
  {
    title: "Data Quality Sweep", category: "Other", dbType: "DATABASE1",
    description: "Catch-all sweep for records failing the standing data-quality assertions.",
    keyPrefix: "DQ", columns: ["finding_ref", "assertion", "table_name", "record_id", "detected_at"],
    enums: { assertion: ["NOT_NULL", "UNIQUE", "REFERENTIAL", "RANGE"], table_name: ["orders", "customers", "products", "shipments"] },
    sql: "SELECT finding_ref, assertion, table_name, record_id, detected_at\nFROM dq_findings\nWHERE cleared_at IS NULL\n  AND detected_at >= @begin_date\n  AND detected_at <  @end_date",
    cron: "0 0 2 * * *", owner: "Data Quality", ownerEmail: "dq@example.com",
    recipients: "dq@example.com", cadence: "all", lookback: 5, cases: 12,
  },
];

const GENERATED = GEN_SPECS.map((spec, i) => generateItem(spec, 9 + i));

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const MOCK_QUERIES: MonitoringQuery[] = [
  ...BASE_QUERIES,
  ...GENERATED.map((g) => g.query),
];

export const MOCK_ACTIVITY: MockActivity[] = [
  ...BASE_ACTIVITY,
  ...GENERATED.flatMap((g) => g.activity),
];

export const MOCK_RESULTS: MonitoringResult[] = [
  ...unfulfilled,
  ...payments,
  ...inventory,
  ...duplicates,
  ...sessions,
  ...refunds,
  ...revenue,
  ...registrations,
  ...GENERATED.flatMap((g) => g.results),
];

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------
// The real service assigns roles against its own tables rather than Cognito groups,
// so the admin screen is authoritative without anyone visiting the AWS console.
// `bootstrapAdmin` users are admins by configuration and cannot be edited here.

export interface MockUser {
  email: string;
  name: string | null;
  roles: ("ADMIN" | "EDITOR" | "VIEWER")[];
  active: boolean;
  bootstrapAdmin: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export const MOCK_USERS: MockUser[] = [
  {
    email: "demo@example.com", name: "Demo User", roles: ["ADMIN"], active: true,
    bootstrapAdmin: true, createdAt: "2025-01-05T09:00:00", lastLoginAt: "2025-05-06T08:15:00",
  },
  {
    email: "priya.raman@example.com", name: "Priya Raman", roles: ["EDITOR"], active: true,
    bootstrapAdmin: false, createdAt: "2025-02-11T10:30:00", lastLoginAt: "2025-05-05T16:42:00",
  },
  {
    email: "marcus.webb@example.com", name: "Marcus Webb", roles: ["EDITOR"], active: true,
    bootstrapAdmin: false, createdAt: "2025-02-19T14:05:00", lastLoginAt: "2025-05-02T11:20:00",
  },
  {
    email: "ops@example.com", name: "Ops Team", roles: ["VIEWER"], active: true,
    bootstrapAdmin: false, createdAt: "2025-03-02T08:00:00", lastLoginAt: "2025-04-30T09:05:00",
  },
  {
    email: "finance@example.com", name: "Finance Team", roles: ["VIEWER"], active: true,
    bootstrapAdmin: false, createdAt: "2025-03-14T13:45:00", lastLoginAt: null,
  },
  {
    email: "contractor@example.com", name: "Sam Okafor", roles: ["VIEWER"], active: false,
    bootstrapAdmin: false, createdAt: "2025-01-28T09:15:00", lastLoginAt: "2025-03-19T17:30:00",
  },
];
