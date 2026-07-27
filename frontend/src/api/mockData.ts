import type { MonitoringQuery, MonitoringResult, MonitoringResultRow, RowStatus } from "../types/monitoring";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const MOCK_QUERIES: MonitoringQuery[] = [
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

const D: Record<string, string> = Object.fromEntries(
  Array.from({ length: 14 }, (_, i) => [`DAY${String(i + 1).padStart(2, "0")}`, daysAgo(13 - i)]),
);

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

export const MOCK_ACTIVITY: MockActivity[] = [
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
const ACTIVITY_COUNTS: Record<string, number> = MOCK_ACTIVITY.reduce<Record<string, number>>(
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
// Export
// ---------------------------------------------------------------------------

export const MOCK_RESULTS: MonitoringResult[] = [
  ...unfulfilled,
  ...payments,
  ...inventory,
  ...duplicates,
  ...sessions,
  ...refunds,
  ...revenue,
  ...registrations,
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
