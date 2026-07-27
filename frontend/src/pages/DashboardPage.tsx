import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, subDays, differenceInCalendarDays } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AgGridReact, useGridFilter } from "ag-grid-react";
import type { CustomFilterProps } from "ag-grid-react";
import type { ColDef, Column, GridApi, GridReadyEvent } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  Home,
  Info,
  Layers,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  Save,
  SkipForward,
  TrendingUp,
  X,
  Zap,
  MousePointerClick,
  ChevronsUpDown,
  UserPlus,
  Users,
  MessageSquare,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchQueries, fetchResults, fetchAllResultRows, triggerRun, createQuery, updateQuery, deleteQuery, updateRow, setOnHold, fetchCaseActivity, addCaseComment, fetchCaseWorkload } from "@/api/monitoring";
import { demoLogout, hasRole, isDemoMode, logout } from "@/auth/auth";
import UserAdminModal from "@/components/UserAdminModal";
import { downloadXlsx } from "@/lib/xlsx";
import type { AllCasesRow, CaseActivity, CaseKeySource, CaseRef, CaseWorkloadResponse, MonitoringQuery, MonitoringResult, MonitoringResultRow, RowStatus } from "@/types/monitoring";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Constants ────────────────────────────────────────────────────────────────

const QUERY_COLORS = [
  "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
  "#84cc16", "#a855f7", "#3b82f6", "#22c55e", "#eab308",
];

const ROW_STATUS_COLORS: Record<RowStatus, string> = {
  OPEN: "#6b7280",
  IN_PROGRESS: "#f59e0b",
  DONE: "#10b981",
};

const ALL_DB_TYPES = ["DATABASE1", "DATABASE2", "DATABASE3", "DATABASE4"];

// Category buckets in display order. Must match the V1_0_4 taxonomy.
const CATEGORY_ORDER = [
  "PG / Payment", "Reward", "Order Delivery", "Order Validation", "BOPIS", "Cancel / Refund",
  "Export & ERP I/F", "Interface Health", "Marketplace", "ESP", "TPA",
  "Membership", "Service", "Other",
];
const CATEGORY_FALLBACK = "Other";

// One distinct color per category, aligned 1:1 with CATEGORY_ORDER so categories
// keep a stable color identity across the app (pies, sidebar, category pages).
const CATEGORY_COLORS = [
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a",
  "#059669", "#0891b2", "#2563eb", "#4f46e5", "#7c3aed", "#9333ea",
  "#c026d3", "#6b7280",
];

// Stable display order for a category; unknown values sort last (alphabetically).
function categoryRank(cat: string): number {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

// Stable color for a category: by taxonomy position when known, else a hash of
// the name so custom categories still get a consistent, distinct color.
function categoryColor(cat: string): string {
  const i = CATEGORY_ORDER.indexOf(cat);
  if (i !== -1) return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
  let h = 0;
  for (let j = 0; j < cat.length; j++) h = (Math.imul(h, 31) + cat.charCodeAt(j)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

// Per-category descriptions, keyed by category name (parallel to CATEGORY_ORDER).
// TODO(copy): placeholder text — replace with real descriptions when supplied.
// Custom/unmapped categories return null (no description shown).
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "PG / Payment": "Payment gateway and settlement monitoring — captures, authorizations, refunds, and PG reconciliation mismatches.",
  "Reward": "Reward points and membership-benefit monitoring — accrual, redemption, and balance discrepancies in the reward system.",
  "Order Delivery": "Order delivery monitoring — delivery order lifecycle, fulfillment, and shipment status issues.",
  "Order Validation": "Order validation monitoring — order validation, eligibility, and pre-fulfillment checks.",
  "BOPIS": "Buy Online, Pick-up In Store monitoring — store pickup orders, reservation, and pickup-status exceptions.",
  "Cancel / Refund": "Cancellation and refund monitoring — cancelled orders, refund processing, and restocking edge cases.",
  "Export & ERP I/F": "Export and ERP interface monitoring — data exports and ERP interface transfers and failures.",
  "Interface Health": "Interface health monitoring — uptime, latency, and error rates across external system integrations.",
  "Marketplace": "Marketplace monitoring — marketplace vendor, listing, and order-sync issues.",
  "ESP": "ESP integration monitoring — email/notification service-provider delivery and template issues.",
  "TPA": "Third-Party Application monitoring — external partner application integrations and data exchange.",
  "Membership": "Membership monitoring — sign-up, tier, and membership lifecycle data issues.",
  "Service": "Service request monitoring — after-sales service, claims, and support-related cases.",
  "Other": "Uncategorized monitoring items that do not fall under a specific taxonomy bucket.",
};

// Description for a category, or null for unknown/custom categories.
function categoryDescription(cat: string): string | null {
  return CATEGORY_DESCRIPTIONS[cat] ?? null;
}

// ── Case age ─────────────────────────────────────────────────────────────────
// Cases bucketed by how long ago they were *first seen*, on a log-ish scale: narrow
// bands where recency matters, widening as cases age. A flat daily cut would leave an
// item with a year of history rendering as one gray wedge and seven slivers.
//
// Lower bound in days, ascending. Parallel to CASE_AGE_COLORS — re-cutting the scale
// is an edit to these two arrays and nothing else.
const CASE_AGE_BUCKETS = [
  { minDays: 0, label: "Today" },
  { minDays: 1, label: "Yesterday" },
  { minDays: 2, label: "2–3 days ago" },
  { minDays: 4, label: "4–6 days ago" },
  { minDays: 7, label: "1–2 weeks" },
  { minDays: 14, label: "2–4 weeks" },
  { minDays: 30, label: "1–3 months" },
  { minDays: 90, label: "90+ days" },
] as const;

const CASE_AGE_COLORS = [
  "#dc2626", "#ea580c", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#6b7280",
];

const CASE_AGE_DESCRIPTION =
  "Open cases grouped by when they were first seen. A case keeps its original first-seen " +
  "date when it recurs, so a long-running case ages rather than resetting. Cases on items " +
  "without a configured identity are excluded — their identity changes every run, so they " +
  "cannot be aged.";

// The bug this guards against is the browser's *time zone*, not its clock: run_date is a
// New York calendar date, and a browser in Seoul would bucket a case a day early. Pinning
// the zone fixes exactly that, needs no round trip, and — because it re-evaluates on every
// call — never goes stale across midnight the way a fetched date would.
const APP_TIME_ZONE = "America/New_York";
const NY_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in the application's zone, as `yyyy-MM-dd`. Never use `new Date()` instead. */
function nyToday(): string {
  const p = Object.fromEntries(NY_DATE_FORMAT.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** The current month in the application's zone, as `yyyy-MM`. Never derive this from `new Date()`. */
function nyMonth(): string {
  return nyToday().slice(0, 7);
}

// ── Scan range ────────────────────────────────────────────────────────────────
//
// The date range a run asks the *target* database for — `so.created_at` on DATABASE1,
// `transfer_date` on DATABASE3. This is NOT the All Cases from/to filter: that one narrows rows
// already collected, by the date each case was first seen. The two are independent, and a
// case created on the 3rd can be recorded by a run on the 22nd, so it can sit inside one
// range and outside the other. They are deliberately worded and placed differently, and
// must never be wired together — syncing them would hide rows a run had just produced.

/** Days the default scan range covers, matching the server's own default lookback. */
const DEFAULT_LOOKBACK_DAYS = 7;

type ScanWindow = {
  /** Inclusive, `yyyy-MM-dd`. Ignored while `includePastUnresolved` is set. */
  beginDate: string;
  /** Inclusive, `yyyy-MM-dd`. */
  endDate: string;
  includePastUnresolved: boolean;
};

/** The last week through today, in the application's zone. Recomputed per call, never cached. */
function defaultScanWindow(): ScanWindow {
  const today = nyToday();
  return {
    beginDate: format(subDays(parseISO(today), DEFAULT_LOOKBACK_DAYS), "yyyy-MM-dd"),
    endDate: today,
    includePastUnresolved: false,
  };
}

function isDefaultScanWindow(w: ScanWindow): boolean {
  const d = defaultScanWindow();
  return !w.includePastUnresolved && w.beginDate === d.beginDate && w.endDate === d.endDate;
}

/** `2026-07-15`, `2026-07-22` → `Jul 15 – Jul 22`. */
function formatScanRange(beginDate: string, endDate: string): string {
  try {
    return `${format(parseISO(beginDate), "MMM d")} – ${format(parseISO(endDate), "MMM d")}`;
  } catch {
    return `${beginDate} – ${endDate}`;
  }
}

/** Whole days between two `yyyy-MM-dd` dates, never negative. */
function daysOpen(firstSeen: string, today: string): number {
  try {
    return Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(firstSeen)));
  } catch {
    return 0;
  }
}

/** `2026-07` → `July 2026`. */
function monthLabel(month: string): string {
  return format(parseISO(`${month}-01`), "MMMM yyyy");
}

/** Steps a `yyyy-MM` by whole months. Crosses year boundaries; never produces `2026-13`. */
function shiftMonth(month: string, delta: number): string {
  return format(addMonths(parseISO(`${month}-01`), delta), "yyyy-MM");
}

/** The identity a case row and a `CaseRef` are joined on. */
function caseRefKey(ref: { msorId: number; caseKey: string }): string {
  return `${ref.msorId}:${ref.caseKey}`;
}

/** Index into CASE_AGE_BUCKETS. `firstSeen` and `today` are both `yyyy-MM-dd`. */
function caseAgeBucket(firstSeen: string, today: string): number {
  // A first_date in the future (skewed client clock) folds into Today rather than
  // producing a negative index: a silent bucket beats an out-of-range crash.
  const days = Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(firstSeen)));
  for (let i = CASE_AGE_BUCKETS.length - 1; i >= 0; i--) {
    if (days >= CASE_AGE_BUCKETS[i].minDays) return i;
  }
  return 0; // unreachable: minDays[0] === 0 and days >= 0
}

/** A row-hash case key churns every run, so its first-seen date is meaningless. */
function isAgeable(row: { caseKeySource: CaseKeySource | null }): boolean {
  return row.caseKeySource !== "ROW_HASH";
}

type CaseAgeSlice = { name: string; value: number; color: string };
type CaseAgeData = {
  slices: CaseAgeSlice[];
  /** Cases actually bucketed. */
  total: number;
  /** Cases dropped because their key is a row-hash — a real, explainable exclusion. */
  excluded: number;
  /** Cases whose first-seen date could not be looked up — stale or failed fetch, not a data property. */
  unknown: number;
};

/**
 * Buckets the rows a page already renders, using `firstSeenByKey` purely as a lookup.
 *
 * Bucketing the page's own rows — rather than piing the /monitoring-result-rows payload
 * directly — is what keeps this pie's total equal to the number the page already
 * advertises. That endpoint returns every case ever recorded, including cases long gone
 * from the latest run.
 *
 * `excluded` and `unknown` are counted apart on purpose: the first says "this case has no
 * stable identity", the second says "we could not load first-seen dates". Reporting the
 * second as the first would blame the data for a network failure.
 */
function buildCaseAgeData(
  rows: { msorId: number; caseKey: string; caseKeySource: CaseKeySource | null }[],
  firstSeenByKey: Map<string, string>,
  today: string,
): CaseAgeData {
  const counts = new Array<number>(CASE_AGE_BUCKETS.length).fill(0);
  let excluded = 0;
  let unknown = 0;
  let total = 0;
  for (const row of rows) {
    if (!isAgeable(row)) { excluded++; continue; }
    const firstSeen = firstSeenByKey.get(`${row.msorId}:${row.caseKey}`);
    if (!firstSeen) { unknown++; continue; }
    counts[caseAgeBucket(firstSeen, today)]++;
    total++;
  }
  const slices = CASE_AGE_BUCKETS
    .map((b, i) => ({ name: b.label, value: counts[i], color: CASE_AGE_COLORS[i] }))
    .filter((s) => s.value > 0);
  return { slices, total, excluded, unknown };
}

const EMPTY_CASE_AGE: CaseAgeData = { slices: [], total: 0, excluded: 0, unknown: 0 };

// "{n} of {total} cases · {k} excluded" — the excluded clause disappears at k = 0, so the
// caveat is only shown when it is true. Seeding identity_columns empties it for good.
// `unknown` counts toward the denominator so the pie never overstates its own coverage.
function caseAgeSubtitle({ slices, total, excluded, unknown }: CaseAgeData): string {
  if (total === 0) return excluded > 0 ? `${excluded} case${pluralS(excluded)} excluded` : "No cases";
  const considered = total + excluded + unknown;
  const head = considered > total ? `${total} of ${considered} cases` : `${total} case${pluralS(total)}`;
  const tail = excluded > 0
    ? ` · ${excluded} excluded`
    : ` · oldest ${slices[slices.length - 1].name.toLowerCase()}`;
  return head + tail;
}

// Static landing-page copy. TODO(copy): placeholder text — replace when supplied.
const HOME_DESCRIPTION =
  "Overview of all monitoring items across every category. Each item runs a query on a schedule and surfaces open cases that need attention.";
const ALL_CASES_DESCRIPTION =
  "Every open case across all monitoring items and dates in one table. Filter, triage, and update case status and comments inline.";

// Group monitoring items by category, in taxonomy order.
function groupByCategory<T extends { category?: string | null }>(items: T[]): { category: string; items: T[] }[] {
  const byCat = new Map<string, T[]>();
  for (const q of items) {
    const cat = q.category ?? CATEGORY_FALLBACK;
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(q);
  }
  return [...byCat.entries()]
    .map(([category, list]) => ({ category, items: list }))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Renders a pie slice's value centered inside the slice. A dark halo (stroke
// painted behind the white fill) keeps it legible on any slice color.
//
// Slices too slim to hold their number render no label at all: a number wider
// than its slice would sit on top of the neighbors' numbers, and the exact
// value is still one hover away in the tooltip. Fit is judged by comparing the
// slice's arc width at the label radius against a rough width for the text
// (~7px per digit at 12px bold, plus the halo).
function renderSliceValueLabel(props: {
  cx?: number; cy?: number; midAngle?: number;
  innerRadius?: number; outerRadius?: number; value?: number; percent?: number;
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, value = 0, percent = 0 } = props;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const labelWidth = String(value).length * 7 + 6;
  const arcWidth = percent * 2 * Math.PI * radius;
  if (arcWidth < labelWidth) return null;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      stroke="rgba(0,0,0,0.55)"
      strokeWidth={2.5}
      paintOrder="stroke"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="0.75rem"
      fontWeight={700}
    >
      {value}
    </text>
  );
}

function StatusBadge({ status }: { status: MonitoringResult["resultStatus"] }) {
  if (status === "SUCCESS")
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Success
      </Badge>
    );
  if (status === "FAIL")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Fail
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <SkipForward className="h-3 w-3" />
      Skipped
    </Badge>
  );
}

function formatDate(iso: string) {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso;
  }
}

// Pluralization suffix helper: keeps "s"/"" out of nested ternaries in templates.
function pluralS(count: number) {
  return count === 1 ? "" : "s";
}

/**
 * Empty-state copy for a run's charts. Now that Done cases are withheld from later runs, a run
 * with zero cases means one of two opposite things — the team is caught up, or the condition
 * cleared — and the operator has to be able to tell which.
 */
function emptyCasesText(result: MonitoringResult | null | undefined) {
  if (result?.resultCount !== 0) return "No row data loaded";
  const done = result.suppressedCount ?? 0;
  return done > 0
    ? `All ${done} case${pluralS(done)} for this date are done`
    : "No cases for this date";
}

function formatFullDate(iso: string) {
  try {
    return format(parseISO(iso), "MMMM d, yyyy");
  } catch {
    return iso;
  }
}

// ── Shop admin order links ─────────────────────────────────────────────────
// The shop admin order page is keyed by the internal entity id (aliased
// "order_id" in the seed queries — see the Flyway seeds), which is NOT the
// human-facing increment_id. We render the increment_id as the link text but
// build the URL from the entity id found in the same row.
//
// The admin base URL is deployment-specific and is supplied at build time via
// VITE_SHOP_ADMIN_ORDER_URL. When unset (as in the public demo) no link is
// rendered and the increment_id shows as plain text.

const SHOP_ADMIN_ORDER_URL = import.meta.env.VITE_SHOP_ADMIN_ORDER_URL ?? "";

function isIncrementIdColumn(col: string): boolean {
  return col.trim().toLowerCase() === "increment_id";
}

// Pull the shop entity id (order_id / entity_id) from a result row's data.
function shopOrderEntityId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const raw = data.order_id ?? data.entity_id ?? data.ORDER_ID ?? data.ENTITY_ID;
  if (raw === null || raw === undefined || raw === "") return null;
  const str = String(raw).trim();
  return /^\d+$/.test(str) ? str : null;
}

// Only DATABASE1 rows map to the shop admin order page. Other db types (e.g.
// DATABASE3, whose `increment_id` is an ERP document-ref substring) must never
// render a shop link, even if their data happens to carry an
// order_id/entity_id-named column.
function isShopLinkable(dbType: string | undefined | null): boolean {
  return (dbType ?? "").toUpperCase() === "DATABASE1";
}

function IncrementIdLinkCell({ incrementId, entityId }: { incrementId: string; entityId: string | null }) {
  if (!incrementId) return null;
  if (!entityId || !SHOP_ADMIN_ORDER_URL) return <span>{incrementId}</span>;
  return (
    <a
      href={`${SHOP_ADMIN_ORDER_URL}/${entityId}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-primary hover:underline"
      title="Open order in shop admin"
    >
      {incrementId}
    </a>
  );
}

// ── Empty-column detection ─────────────────────────────────────────────────
// A cell is blank when it's null/undefined or a whitespace-only string, so a
// column that is empty strings (or spaces) across every row collapses too.
function isBlankCell(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return String(v).trim() === "";
}

// Data columns blank in every row — collapsed by default.
function findEmptyDataColumns<T extends { data: Record<string, unknown> }>(columns: string[], rows: T[]): string[] {
  if (rows.length === 0) return [];
  return columns.filter((col) => rows.every((r) => isBlankCell(r.data?.[col])));
}

// ── Excel export ───────────────────────────────────────────────────────────
// Works on any AG Grid: reads the currently displayed columns and the rows in
// their post-filter/post-sort order straight from the grid api, so the export
// matches exactly what the user sees.
function exportAgGridToExcel(api: GridApi | undefined | null, fileName: string, sheetName: string): void {
  if (!api) return;
  const cols = api.getAllDisplayedColumns().filter((col: Column) => {
    const def = col.getColDef();
    if (def.checkboxSelection) return false;        // selection checkbox column
    const header = def.headerName ?? "";
    return header !== "" && header !== "#";          // skip blank + row-number columns
  });
  const headers = cols.map(
    (col: Column) => api.getDisplayNameForColumn(col, null) || col.getColDef().headerName || col.getColId(),
  );
  const rows: string[][] = [];
  api.forEachNodeAfterFilterAndSort((node) => {
    if (!node.data) return;
    rows.push(
      cols.map((col: Column) => {
        const v = api.getCellValue({ rowNode: node, colKey: col });
        return v === null || v === undefined ? "" : String(v);
      }),
    );
  });
  downloadXlsx(fileName, sheetName, headers, rows);
}

// ── Info popover ───────────────────────────────────────────────────────────
// Small click-to-open popover used to surface a monitoring item's description.
function InfoPopover({ text, label = "Description" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function toggle() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        title="Show description"
        className={cn(
          "rounded p-1 transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent",
          open && "bg-accent text-foreground",
        )}
      >
        <Info className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-80 rounded-md border bg-background shadow-lg p-3"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{text}</p>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Hover description tooltip ────────────────────────────────────────────────
// Wraps a trigger and shows `text` in a portal panel anchored near the cursor
// after a short open delay. The wrapper uses display:contents so it never
// affects the trigger's layout; the panel is pointer-events:none so it never
// intercepts clicks. Renders only the children (no tooltip) when `text` is empty,
// which keeps it safe to wrap items/categories that may have no description.
function HoverDescription({
  text,
  label = "Description",
  children,
}: {
  text: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  if (!text || text.trim().length === 0) return <>{children}</>;

  // Place the panel near the cursor, flipping away from the right/bottom edges.
  function place(clientX: number, clientY: number) {
    const PANEL_W = 320, PANEL_H = 160, GAP = 14;
    let left = clientX + GAP;
    let top = clientY + GAP;
    if (left + PANEL_W > window.innerWidth) left = clientX - PANEL_W - GAP;
    if (left < 8) left = 8;
    if (top + PANEL_H > window.innerHeight) top = window.innerHeight - PANEL_H - 8;
    if (top < 8) top = 8;
    setPos({ top, left });
  }

  function handleEnter(e: React.MouseEvent) {
    const { clientX, clientY } = e;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { place(clientX, clientY); setOpen(true); }, 300);
  }

  function handleLeave() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setOpen(false);
  }

  return (
    <span style={{ display: "contents" }} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {open && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, pointerEvents: "none" }}
          className="w-80 rounded-md border bg-background shadow-lg p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{text}</p>
        </div>,
        document.body,
      )}
    </span>
  );
}

// ── Column visibility ──────────────────────────────────────────────────────
// Two rules want to hide a column: the automatic empty-column rule, and the
// user's own choice in the column picker. They must not each drive the grid api
// separately or they clobber one another (un-hide an empty column, and the empty
// rule re-hides it on its next pass). So the user's choices are held as a sparse
// override map, resolved against the auto rule into one final visibility set,
// which a single effect applies. An absent override means "follow the default",
// which is what makes a never-touched blank column still auto-hide and a newly
// appearing column default to visible.

/** colId → visible. A missing entry means "follow the default". */
type ColumnOverrides = Record<string, boolean>;

/** A column the user is allowed to hide. `empty` drives the muted "empty" tag. */
type HideableCol = { colId: string; label: string; empty: boolean };

function resolveVisible(colId: string, overrides: ColumnOverrides, autoHidden: Set<string>): boolean {
  const o = overrides[colId];
  return o !== undefined ? o : !autoHidden.has(colId);
}

// Hideable columns that aren't data columns. The selection checkbox, "#" and
// Status are deliberately absent: the first two are structural, and Status is the
// column the whole case workflow runs on.
const ROWS_META_COLUMNS: HideableCol[] = [
  { colId: "age", label: "Age", empty: false },
  { colId: "comments", label: "Comments", empty: false },
];

const ALL_CASES_META_COLUMNS: HideableCol[] = [
  { colId: "comments", label: "Comments", empty: false },
  { colId: "category", label: "Category", empty: false },
  { colId: "title", label: "Item", empty: false },
  { colId: "dbType", label: "DB Type", empty: false },
  { colId: "runDate", label: "First Seen", empty: false },
];

function loadOverrides(key: string): ColumnOverrides {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    // Drop non-boolean values, so a stale or hand-edited entry can't poison the map.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "boolean"),
    ) as ColumnOverrides;
  } catch {
    return {};
  }
}

// Overrides for columns that aren't present right now are deliberately *kept*:
// All Cases scopes its column set to the category in view, so pruning them would
// forget the user's choice every time they switched category.
function useColumnVisibility(storageKey: string) {
  const [state, setState] = useState<{ key: string; overrides: ColumnOverrides }>(
    () => ({ key: storageKey, overrides: loadOverrides(storageKey) }),
  );

  // The key changes without a remount (RowsTable holds its position in the tree
  // when you switch monitoring items), so re-read on change rather than relying on
  // the initializer. Adjusting state during render is React's supported way to do
  // this; an effect would let one render paint item A's choices onto item B.
  if (state.key !== storageKey) {
    setState({ key: storageKey, overrides: loadOverrides(storageKey) });
  }

  useEffect(() => {
    try {
      if (Object.keys(state.overrides).length === 0) localStorage.removeItem(state.key);
      else localStorage.setItem(state.key, JSON.stringify(state.overrides));
    } catch { /* */ }
  }, [state]);

  const setVisible = useCallback((colId: string, visible: boolean) => {
    setState((s) => ({ ...s, overrides: { ...s.overrides, [colId]: visible } }));
  }, []);

  const setAll = useCallback((colIds: string[], visible: boolean) => {
    setState((s) => ({
      ...s,
      overrides: { ...s.overrides, ...Object.fromEntries(colIds.map((c) => [c, visible])) },
    }));
  }, []);

  // Back to pure default behavior: auto-hide the empty columns, show everything else.
  const reset = useCallback(() => setState((s) => ({ ...s, overrides: {} })), []);

  return { overrides: state.overrides, setVisible, setAll, reset };
}

// Toolbar button that toggles visibility of all-blank columns.
function EmptyColumnsToggle({ count, hidden, onToggle }: { count: number; hidden: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title={hidden ? "Show columns that are empty for every row" : "Hide columns that are empty for every row"}
    >
      {hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      {hidden ? `Show ${count} empty column${pluralS(count)}` : `Hide ${count} empty column${pluralS(count)}`}
    </button>
  );
}

// Toolbar dropdown for choosing which columns a grid shows. AG Grid's own column
// tool panel is an Enterprise feature and this app runs Community, so it's
// hand-rolled — as DataGripSetFilter and lib/xlsx.ts are, for the same reason.
// Portalled because both the toolbar and the grid clip their overflow.
function ColumnPicker({
  columns,
  overrides,
  autoHidden,
  onSetVisible,
  onSetAll,
  onReset,
}: {
  columns: HideableCol[];
  overrides: ColumnOverrides;
  autoHidden: Set<string>;
  onSetVisible: (colId: string, visible: boolean) => void;
  onSetAll: (colIds: string[], visible: boolean) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  if (columns.length === 0) return null;

  const PANEL_W = 240;
  const isVisible = (c: HideableCol) => resolveVisible(c.colId, overrides, autoHidden);
  const hiddenCount = columns.filter((c) => !isVisible(c)).length;
  const allIds = columns.map((c) => c.colId);
  const needle = search.trim().toLowerCase();
  const filtered = needle ? columns.filter((c) => c.label.toLowerCase().includes(needle)) : columns;

  function toggleOpen() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Right-align to the trigger, then pull back inside the viewport edges.
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - PANEL_W, window.innerWidth - PANEL_W - 8)),
    });
    setSearch("");
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        title="Choose which columns to show"
        className={cn(
          "flex items-center gap-1 text-xs transition-colors cursor-pointer hover:text-foreground",
          hiddenCount > 0 || open ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Columns3 className="h-3 w-3" />
        Columns
        {hiddenCount > 0 && <span className="tabular-nums">· {hiddenCount} hidden</span>}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: PANEL_W }}
          className="rounded-md border bg-background shadow-lg p-2 space-y-1.5"
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search columns…"
            autoFocus
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex items-center gap-2 px-1 pb-1 border-b text-xs">
            <button
              onClick={() => onSetAll(allIds, true)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              All
            </button>
            <button
              onClick={() => onSetAll(allIds, false)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              None
            </button>
            <button
              onClick={onReset}
              title="Back to the default: empty columns hidden, everything else shown"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Reset
            </button>
            <span className="flex-1" />
            <span className="text-muted-foreground tabular-nums">
              {columns.length - hiddenCount}/{columns.length}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-px">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No columns match</p>
            ) : (
              filtered.map((c) => (
                <label
                  key={c.colId}
                  className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-accent cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isVisible(c)}
                    onChange={(e) => onSetVisible(c.colId, e.target.checked)}
                    className="cursor-pointer shrink-0"
                  />
                  <span className="flex-1 truncate text-xs font-mono" title={c.label}>{c.label}</span>
                  {c.empty && <span className="text-xs text-muted-foreground shrink-0">empty</span>}
                </label>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Toolbar button that exports a grid (referenced via gridRef) to .xlsx.
function ExcelExportButton({ gridApi, fileName, sheetName }: { gridApi: () => GridApi | undefined | null; fileName: string; sheetName: string }) {
  return (
    <button
      onClick={() => exportAgGridToExcel(gridApi(), fileName, sheetName)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title="Export this table to Excel (.xlsx)"
    >
      <FileSpreadsheet className="h-3 w-3" />
      Export Excel
    </button>
  );
}

// ── Cursor-following tooltip ──────────────────────────────────────────────────

type FollowTooltipEntry = { name: string; value: number; color: string; payload: Record<string, unknown> };

function FollowTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue,
}: {
  active?: boolean;
  payload?: readonly FollowTooltipEntry[];
  label?: string;
  formatLabel?: (label: string, payload: readonly FollowTooltipEntry[]) => React.ReactNode;
  formatValue?: (value: number, name: string) => string;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    function track(e: MouseEvent) { setPos({ x: e.clientX, y: e.clientY }); }
    window.addEventListener("mousemove", track);
    return () => window.removeEventListener("mousemove", track);
  }, []);
  if (!active || !payload?.length) return null;
  const visible = payload.filter((e) => (e.value ?? 0) > 0);
  return createPortal(
    <div
      style={{ position: "fixed", left: pos.x + 14, top: pos.y - 10, zIndex: 1000, pointerEvents: "none" }}
      className="rounded-md border bg-background px-3 py-2 shadow-md text-xs min-w-[120px]"
    >
      <p className="font-medium text-foreground mb-1">
        {formatLabel ? formatLabel(label ?? "", payload) : label}
      </p>
      {visible.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5 leading-relaxed">
          <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          {entry.name && <span className="text-muted-foreground">{entry.name}:</span>}
          <span className="text-foreground">
            {formatValue ? formatValue(entry.value, entry.name) : entry.value}
          </span>
        </p>
      ))}
    </div>,
    document.body,
  );
}

// Module-level tooltip render functions (kept out of component bodies so they are
// not re-created as nested components on every render). Recharts passes the tooltip
// props object, which we forward to FollowTooltip.
function renderCaseTooltip(props: unknown) {
  return <FollowTooltip {...(props as Parameters<typeof FollowTooltip>[0])} formatValue={(v) => `${v} case${pluralS(v)}`} />;
}

function renderRowTooltip(props: unknown) {
  return <FollowTooltip {...(props as Parameters<typeof FollowTooltip>[0])} formatValue={(v) => `${v} row${pluralS(v)}`} />;
}

// The "First Seen" cell, badged NEW when the case first appeared today. Row-hash cases
// are never badged: their key is re-minted every run, so "first seen today" is always
// true of them and would mean nothing.
function renderFirstSeenCell(params: { value?: string; data?: AllCasesRow }) {
  const value = params.value;
  if (!value) return null;
  const isNew = isAgeable({ caseKeySource: params.data?.caseKeySource ?? null })
    && caseAgeBucket(value, nyToday()) === 0;
  return (
    <span className="flex items-center gap-1.5">
      {value}
      {isNew && (
        <span className="rounded-sm bg-primary/10 px-1 text-xs font-bold leading-4 tracking-wide text-primary">NEW</span>
      )}
    </span>
  );
}

// ── Mini calendar popover ─────────────────────────────────────────────────────

function MiniCalendar({
  value,
  onChange,
  availableDates,
  restrictToAvailable = false,
  showClear = true,
  placeholder = "Select date",
}: {
  value: string;
  onChange: (date: string) => void;
  availableDates: Set<string>;
  restrictToAvailable?: boolean;
  showClear?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) { try { return startOfMonth(parseISO(value)); } catch { /* */ } }
    return startOfMonth(new Date());
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (value) { try { setViewDate(startOfMonth(parseISO(value))); } catch { /* */ } }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function toggle() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPopPos({ top: rect.bottom + 4, left: rect.left });
    setOpen((o) => !o);
  }

  const firstDay = startOfMonth(viewDate);
  const days = eachDayOfInterval({ start: firstDay, end: endOfMonth(viewDate) });
  const startDow = getDay(firstDay);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors cursor-pointer hover:bg-accent",
          value && "border-primary/60",
        )}
        title="Select date"
      >
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value ? format(parseISO(value), "MMM d, yyyy") : placeholder}
        </span>
        {value && showClear && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onChange(""); } }}
            className="ml-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          style={{ position: "fixed", top: popPos.top, left: popPos.left, zIndex: 9999 }}
          className="rounded-lg border bg-background shadow-xl p-3 w-60"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setViewDate((d) => subMonths(d, 1))}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold">{format(viewDate, "MMMM yyyy")}</span>
            <button
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d} className="text-center text-xs text-muted-foreground py-0.5">{d}</span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: startDow }).map((_, i) => <span key={`pad-${i}`} />)}
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const isAvailable = availableDates.has(dateStr);
              const isSelected = value === dateStr;
              const isDisabled = restrictToAvailable && availableDates.size > 0 && !isAvailable;
              return (
                <button
                  key={dateStr}
                  disabled={isDisabled}
                  onClick={() => { onChange(isSelected ? "" : dateStr); setOpen(false); }}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded text-xs h-7 w-full transition-colors",
                    isSelected && "bg-primary text-primary-foreground font-medium",
                    !isSelected && !isDisabled && "hover:bg-accent cursor-pointer",
                    !isSelected && isAvailable && "font-medium",
                    isDisabled && "text-muted-foreground/30 cursor-default",
                  )}
                >
                  {format(day, "d")}
                  {isAvailable && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Date Range Picker ────────────────────────────────────────────────────────

function DateRangePicker({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  disabled = false,
  disabledReason,
}: {
  fromDate: string;
  toDate: string;
  onFromChange: (d: string) => void;
  onToChange: (d: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (fromDate) { try { return startOfMonth(parseISO(fromDate)); } catch { /* */ } }
    return startOfMonth(new Date());
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (fromDate) { try { setViewDate(startOfMonth(parseISO(fromDate))); } catch { /* */ } }
  }, [fromDate]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function toggle() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPopPos({ top: rect.bottom + 4, left: rect.left });
    setOpen((o) => !o);
  }

  function handleDayClick(dateStr: string) {
    if (!fromDate || (fromDate && toDate)) {
      onFromChange(dateStr);
      onToChange("");
    } else {
      if (dateStr >= fromDate) {
        onToChange(dateStr);
        setOpen(false);
      } else {
        onFromChange(dateStr);
        onToChange("");
      }
    }
  }

  function isInRange(dateStr: string) {
    if (!fromDate || !toDate) return false;
    return dateStr > fromDate && dateStr < toDate;
  }

  function renderMonth(monthDate: Date) {
    const firstDay = startOfMonth(monthDate);
    const days = eachDayOfInterval({ start: firstDay, end: endOfMonth(monthDate) });
    const startDow = getDay(firstDay);
    return (
      <div className="w-52">
        <div className="text-center text-xs font-semibold mb-2">{format(monthDate, "MMMM yyyy")}</div>
        <div className="grid grid-cols-7 mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <span key={d} className="text-center text-xs text-muted-foreground py-0.5">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {Array.from({ length: startDow }).map((_, i) => <span key={`pad-${i}`} />)}
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isFrom = fromDate === dateStr;
            const isTo = toDate === dateStr;
            const inRange = isInRange(dateStr);
            return (
              <button
                key={dateStr}
                onClick={() => handleDayClick(dateStr)}
                className={cn(
                  "relative flex items-center justify-center rounded text-xs h-7 w-full transition-colors cursor-pointer",
                  (isFrom || isTo) && "bg-primary text-primary-foreground font-medium",
                  !isFrom && !isTo && inRange && "bg-primary/15 rounded-none",
                  !isFrom && !isTo && !inRange && "hover:bg-accent",
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const rightMonth = addMonths(viewDate, 1);
  const hasValue = !!(fromDate || toDate);
  const label = fromDate && toDate
    ? `${format(parseISO(fromDate), "MMM d")} – ${format(parseISO(toDate), "MMM d, yyyy")}`
    : fromDate
    ? `From ${format(parseISO(fromDate), "MMM d, yyyy")}…`
    : "Filter by date range";

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent",
          hasValue && !disabled && "border-primary/60",
        )}
        title={disabled ? disabledReason : "Filter by date range"}
      >
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className={hasValue ? "text-foreground" : "text-muted-foreground"}>{label}</span>
        {hasValue && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onFromChange(""); onToChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onFromChange(""); onToChange(""); } }}
            className="ml-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          style={{ position: "fixed", top: popPos.top, left: popPos.left, zIndex: 9999 }}
          className="rounded-lg border bg-background shadow-xl p-4"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <button
              onClick={() => setViewDate((d) => subMonths(d, 1))}
              className="rounded p-1 mt-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="flex gap-6">
              {renderMonth(viewDate)}
              {renderMonth(rightMonth)}
            </div>
            <button
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              className="rounded p-1 mt-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 pt-2 border-t text-center text-xs text-muted-foreground">
            {(() => {
              if (!fromDate) return "Click a start date";
              if (!toDate) return "Click an end date";
              return `${format(parseISO(fromDate), "MMM d, yyyy")} – ${format(parseISO(toDate), "MMM d, yyyy")}`;
            })()}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Sidebar item ─────────────────────────────────────────────────────────────

function SidebarItem({
  query,
  selected,
  checked,
  selectMode,
  latestResult,
  color,
  onClick,
  onToggleCheck,
  onRun,
  onEdit,
  onHistory,
  onDelete,
  onToggleOnHold,
}: Readonly<{
  query: MonitoringQuery;
  selected: boolean;
  checked: boolean;
  selectMode: boolean;
  latestResult: MonitoringResult | null;
  color: string;
  onClick: () => void;
  onToggleCheck: () => void;
  onRun: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onToggleOnHold: () => void;
}>) {
  const onHold = query.onHoldYn === "Y";
  const count = latestResult?.resultCount ?? null;
  const isFailed = latestResult?.resultStatus === "FAIL";
  const isActive = query.activeYn === "Y";
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [descOpen, setDescOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!descOpen) return;
    function handleOutside(e: MouseEvent) {
      if (descRef.current && !descRef.current.contains(e.target as Node)) setDescOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [descOpen]);

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 144 });
    setMenuOpen((o) => !o);
  }

  let statusIndicator: React.ReactNode = null;
  if (onHold) {
    statusIndicator = <PauseCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="On hold" />;
  } else if (isFailed) {
    statusIndicator = <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  } else if (count !== null && count > 0) {
    statusIndicator = (
      <Badge variant="destructive" className="h-4 shrink-0 px-1 py-0 text-xs leading-none">
        {count}
      </Badge>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-md",
        selected ? "bg-accent" : "hover:bg-accent/60",
        !isActive && "opacity-50",
      )}
    >
      {selectMode && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleCheck}
          onClick={(e) => e.stopPropagation()}
          className="ml-2 shrink-0 cursor-pointer"
          title="Select for run"
        />
      )}
      <HoverDescription text={query.description ?? ""}>
        <button
          onClick={onClick}
          className={cn(
            "flex-1 min-w-0 text-left pl-2 pr-1 py-1.5 text-sm transition-colors cursor-pointer",
            "flex items-center gap-2",
            selected ? "text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
          <span className="truncate flex-1 leading-snug">{query.title}</span>
          {statusIndicator}
        </button>
      </HoverDescription>

      <button
        ref={triggerRef}
        onClick={openMenu}
        className={cn(
          "shrink-0 mr-1 rounded p-1 transition-colors cursor-pointer",
          "opacity-0 group-hover:opacity-100 focus:opacity-100",
          menuOpen && "opacity-100 bg-accent",
          selected ? "text-accent-foreground hover:bg-accent-foreground/10" : "text-muted-foreground hover:bg-accent",
        )}
        title="More options"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {menuOpen && createPortal(
        <div
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-36 rounded-md border bg-background shadow-lg py-0.5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {query.description && (
            <button
              onClick={() => { setMenuOpen(false); setDescOpen(true); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
            >
              <Info className="h-3.5 w-3.5" />
              Description
            </button>
          )}
          <button
            onClick={() => { setMenuOpen(false); onRun(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <Zap className="h-3.5 w-3.5" />
            Run Now
          </button>
          <button
            onClick={() => { setMenuOpen(false); onEdit(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={() => { setMenuOpen(false); onHistory(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <History className="h-3.5 w-3.5" />
            History
          </button>
          <button
            onClick={() => { setMenuOpen(false); onToggleOnHold(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            {onHold ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
            {onHold ? "Resume (count cases)" : "Put on hold"}
          </button>
          <button
            onClick={() => { setMenuOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>,
        document.body,
      )}

      {descOpen && query.description && createPortal(
        <div
          ref={descRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-72 rounded-md border bg-background shadow-lg p-3"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Description</p>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{query.description}</p>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Row status options ────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: RowStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

function statusSelectClass(status: RowStatus) {
  if (status === "IN_PROGRESS") return "border-amber-400/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-600/40";
  if (status === "DONE") return "border-green-400/50 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400 dark:border-green-600/40";
  return "border-border bg-muted/60 text-muted-foreground";
}

// ── Error panel ───────────────────────────────────────────────────────────────

// ── Run control with scan range ───────────────────────────────────────────────

/**
 * "Run Now", plus a popover for the range the run should scan on the target database.
 *
 * Split rather than merged into the toolbar for a specific reason: the toolbar already
 * holds a date picker ("Select run date") that filters *recorded* runs. Two date controls
 * side by side, one filtering history and one directing a live scan, is the confusion this
 * layout exists to avoid — so the scan range lives inside the run action, and is worded as
 * an instruction ("Scan orders created…") rather than a filter ("Showing…").
 *
 * Items whose SQL still carries a literal date floor ignore the range entirely; the caller
 * renders a plain button for those instead of offering controls that would do nothing.
 */
function RunScanControl({
  window,
  onWindowChange,
  onRun,
  running,
}: {
  window: ScanWindow;
  onWindowChange: (w: ScanWindow) => void;
  onRun: () => void;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function toggle() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, right: globalThis.innerWidth - rect.right });
    setOpen((o) => !o);
  }

  const wide = window.includePastUnresolved;
  const custom = !isDefaultScanWindow(window);

  let label: string;
  if (running) label = "Running…";
  else if (wide) label = "Run — all open";
  else label = "Run Now";

  return (
    <>
      <div className="flex items-center">
        <button
          onClick={onRun}
          disabled={running}
          className={cn(
            "flex items-center gap-1.5 rounded-l-md border border-r-0 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed",
            custom && "border-primary/60 text-primary",
          )}
          title={wide
            ? "Scan every case still open since the earliest available date"
            : `Scan ${formatScanRange(window.beginDate, window.endDate)}`}
        >
          <Zap className="h-3.5 w-3.5" />
          {label}
        </button>
        <button
          ref={triggerRef}
          onClick={toggle}
          aria-label="Scan range options"
          aria-expanded={open}
          className={cn(
            "flex items-center rounded-r-md border px-1.5 py-1.5 transition-colors cursor-pointer hover:bg-accent",
            custom && "border-primary/60 text-primary",
          )}
          title="Choose what this run scans"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-80 rounded-md border bg-background p-3 shadow-lg space-y-3"
        >
          <div>
            <p className="text-xs font-semibold">Scan range</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Which orders this run asks the database for — by the date they were created.
              Separate from the date filter on All Cases, which narrows cases already collected.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">From</span>
              <input
                type="date"
                value={window.beginDate}
                max={window.endDate}
                disabled={wide}
                onChange={(e) => onWindowChange({ ...window, beginDate: e.target.value })}
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">To</span>
              <input
                type="date"
                value={window.endDate}
                min={wide ? undefined : window.beginDate}
                onChange={(e) => onWindowChange({ ...window, endDate: e.target.value })}
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Both dates are included in the scan.</p>

          <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/50 transition-colors">
            <input
              type="checkbox"
              checked={wide}
              onChange={(e) => onWindowChange({ ...window, includePastUnresolved: e.target.checked })}
              className="mt-0.5 cursor-pointer"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium">Show past unresolved cases</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Also return cases from before the range that nobody has marked Done.
                Scans all available history — slower, and it sends no alerts.
              </span>
            </span>
          </label>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => onWindowChange(defaultScanWindow())}
              disabled={!custom}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset to last {DEFAULT_LOOKBACK_DAYS} days
            </button>
            <button
              onClick={() => { setOpen(false); onRun(); }}
              disabled={running}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="h-3.5 w-3.5" />
              Run
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * The range a recorded run actually scanned. Without it a bare "0 cases" is ambiguous —
 * it could mean nothing is broken, or that nothing broke in those seven days — and a
 * widened scan's count looks like a spike next to the daily runs around it.
 */
function ScanRangeNote({ result }: { result: MonitoringResult }) {
  if (result.pastUnresolvedYn === "Y") {
    return (
      <span className="text-muted-foreground">
        {" · "}includes past unresolved cases
      </span>
    );
  }
  if (!result.beginDate || !result.endDate) return null;
  return (
    <span className="text-muted-foreground">
      {" · "}scanned {formatScanRange(result.beginDate, result.endDate)}
    </span>
  );
}

/**
 * A row cap breached by a widened scan is not the same failure as a runaway query, and the
 * generic "narrow the query, or raise max-rows" text sends the operator to the wrong place:
 * the query is fine, the range is simply too wide. Only reworded when the run actually was
 * a widened scan — the same message from a daily run still means what it says.
 */
function tooLargeHint(message: string, pastUnresolved: boolean): string | null {
  if (!pastUnresolved || !message.includes("configured maximum")) return null;
  return "Too many unresolved cases to list. Narrow the date range, or work through the "
    + "current backlog before widening the scan again.";
}

function ErrorPanel({ message, detail, pastUnresolved = false }: {
  message: string;
  detail: string | null;
  pastUnresolved?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hint = tooLargeHint(message, pastUnresolved);

  return (
    <div className="shrink-0 rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">
            {hint ? "Too many results" : "Execution failed"}
          </p>
          <p className="mt-0.5 text-sm text-destructive/80 break-words">{hint ?? message}</p>
        </div>
        {detail && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0 flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive transition-colors cursor-pointer"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide detail" : "Show detail"}
          </button>
        )}
      </div>
      {expanded && detail && (
        <pre className="mt-2 overflow-x-auto rounded bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive/90 whitespace-pre-wrap break-all">
          {detail}
        </pre>
      )}
    </div>
  );
}

// ── DataGrip-style set filter ─────────────────────────────────────────────────

// model: string[] of included values, or null = no filter (all shown)
function DataGripSetFilter({ model, onModelChange, getValue, api }: CustomFilterProps) {
  const [allValues, setAllValues] = useState<{ value: string; count: number }[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const counts = new Map<string, number>();
    api.forEachNode((node) => {
      const raw = getValue(node);
      const str = raw == null || raw === "" ? "(blank)" : String(raw);
      counts.set(str, (counts.get(str) ?? 0) + 1);
    });
    setAllValues(
      Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
        .map(([value, count]) => ({ value, count })),
    );
  }, []);

  useGridFilter({
    doesFilterPass: useCallback(
      (params) => {
        if (!model) return true;
        const raw = getValue(params.node);
        const str = raw == null || raw === "" ? "(blank)" : String(raw);
        return (model as string[]).includes(str);
      },
      [model, getValue],
    ),
  });

  const selected = useMemo(
    () => (model ? new Set(model as string[]) : new Set(allValues.map((v) => v.value))),
    [model, allValues],
  );

  const allSelected = !model || selected.size >= allValues.length;
  const someSelected = !allSelected && selected.size > 0;

  function toggleValue(value: string) {
    const next = new Set(selected);
    next.has(value) ? next.delete(value) : next.add(value);
    onModelChange(next.size >= allValues.length ? null : Array.from(next));
  }

  function toggleAll() {
    onModelChange(allSelected ? [] : null);
  }

  const filtered = search.trim()
    ? allValues.filter((v) => v.value.toLowerCase().includes(search.toLowerCase()))
    : allValues;

  return (
    <div className="p-2 space-y-1.5" style={{ width: 224 }}>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search values…"
        autoFocus
        className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-2 px-1 pb-1 border-b">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected; }}
          onChange={toggleAll}
          className="cursor-pointer"
        />
        <span className="flex-1 text-xs text-muted-foreground font-mono">Select All</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {selected.size}/{allValues.length}
        </span>
      </div>
      <div className="max-h-52 overflow-y-auto space-y-px">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No values match</p>
        ) : (
          filtered.map(({ value, count }) => (
            <label key={value} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-accent cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(value)}
                onChange={() => toggleValue(value)}
                className="cursor-pointer shrink-0"
              />
              <span className="flex-1 truncate text-xs font-mono">{value}</span>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">{count}</span>
            </label>
          ))
        )}
      </div>
      {model !== null && (
        <button
          onClick={() => onModelChange(null)}
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-1 py-1 border-t hover:bg-accent transition-colors cursor-pointer"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

// ── AG Grid rows table ────────────────────────────────────────────────────────

// A bulk change: set status and/or comment. A missing key leaves that field
// untouched on each affected row.
type BulkRowChange = { status?: RowStatus; comment?: string | null };

function RowsTable({
  rows,
  dbType,
  msorId,
  firstSeenByKey,
  windowBegin,
  onUpdateRow,
  onBulkUpdate,
  exportFileName,
  exportSheetName,
}: {
  rows: MonitoringResultRow[];
  dbType: string;
  msorId: number;
  /** `msorId:caseKey` -> first-seen date. Absent for a case whose history has not loaded. */
  firstSeenByKey: Map<string, string>;
  /** First day the run scanned; a case first seen before it is older than this run's range. */
  windowBegin: string | null;
  onUpdateRow: (rowId: number, status: RowStatus, comment: string | null) => Promise<void>;
  onBulkUpdate: (rowIds: number[], changes: BulkRowChange) => Promise<void>;
  exportFileName: string;
  exportSheetName: string;
}) {
  const gridRef = useRef<AgGridReact>(null);

  const [selectedCount, setSelectedCount] = useState(0);
  const [bulkComment, setBulkComment] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);

  const handleSelectionChanged = useCallback(() => {
    setSelectedCount(gridRef.current?.api?.getSelectedRows().length ?? 0);
  }, []);

  // Bulk edits stage into the same pending-changes buffer as inline edits (via
  // onBulkUpdate), so the single "Save Changes" button commits everything at
  // once. Selecting a status applies it immediately to the selection; typing a
  // comment stages on Enter or blur. Nothing is persisted until "Save Changes".
  const stageBulk = useCallback((changes: BulkRowChange) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const ids = (api.getSelectedRows() as MonitoringResultRow[]).map((r) => r.rowId);
    if (ids.length === 0) return;
    void onBulkUpdate(ids, changes);
  }, [onBulkUpdate]);

  // Bulk comment now posts one comment to every selected case's activity thread
  // (append-only), rather than staging a single-field edit. Status bulk-edits
  // still stage into "Save Changes" via stageBulk.
  const applyBulkComment = useCallback(async () => {
    const c = bulkComment.trim();
    if (!c) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const selected = api.getSelectedRows() as MonitoringResultRow[];
    if (selected.length === 0) return;
    setBulkComment("");
    try {
      await Promise.all(selected.map((r) => addCaseComment(msorId, r.caseKey, c)));
      selected.forEach((r) => { r.activityCount = (r.activityCount ?? 0) + 1; });
      api.refreshCells({ force: true });
    } catch (e) {
      console.error("Failed to post bulk comment", e);
    }
  }, [bulkComment, msorId]);

  const columns = useMemo<string[]>(
    () => Array.from(new Set(rows.flatMap((r) => Object.keys(r.data)))),
    [rows],
  );

  const emptyColumns = useMemo(() => findEmptyDataColumns(columns, rows), [columns, rows]);

  // Column choices are remembered per monitoring item — the column set differs
  // per item, and so does what's worth looking at.
  const { overrides, setVisible, setAll, reset } = useColumnVisibility(`msor.cols.v1.item.${msorId}`);

  // The auto rule, keyed by colId so it composes with the picker's overrides.
  const autoHidden = useMemo(
    () => new Set(hideEmpty ? emptyColumns.map((c) => `data.${c}`) : []),
    [hideEmpty, emptyColumns],
  );

  const hideableCols = useMemo<HideableCol[]>(() => {
    const emptySet = new Set(emptyColumns);
    return [
      ...ROWS_META_COLUMNS,
      ...columns.map((c) => ({ colId: `data.${c}`, label: c, empty: emptySet.has(c) })),
    ];
  }, [columns, emptyColumns]);

  const isVisible = useCallback(
    (colId: string) => resolveVisible(colId, overrides, autoHidden),
    [overrides, autoHidden],
  );

  const colDefs = useMemo<ColDef[]>(() => {
    const fixed: ColDef[] = [
      {
        headerCheckboxSelection: true,
        checkboxSelection: true,
        width: 36,
        maxWidth: 36,
        pinned: "left",
        sortable: false,
        filter: false,
        resizable: false,
        suppressSizeToFit: true,
        headerName: "",
      },
      {
        headerName: "#",
        valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
        width: 44,
        minWidth: 44,
        maxWidth: 44,
        pinned: "left",
        sortable: false,
        suppressSizeToFit: true,
        cellClass: "text-center text-xs text-muted-foreground tabular-nums",
      },
      {
        headerName: "Status",
        field: "rowStatus",
        colId: "rowStatus",
        width: 150,
        suppressSizeToFit: true,
        filter: DataGripSetFilter,
        cellRenderer: (p: { data: MonitoringResultRow }) => (
          <StatusSelectCell row={p.data} onUpdate={onUpdateRow} />
        ),
      },
      {
        headerName: "Age",
        colId: "age",
        width: 110,
        suppressSizeToFit: true,
        filter: false,
        hide: !isVisible("age"),
        // Sorts on the number, not the rendered "21d" string, so ordering is numeric rather
        // than lexical ("9d" would otherwise sort after "21d").
        valueGetter: (p: { data: MonitoringResultRow }) => {
          const seen = firstSeenByKey.get(`${msorId}:${p.data?.caseKey}`);
          if (!seen || !isAgeable({ caseKeySource: p.data?.caseKeySource ?? null })) return null;
          return daysOpen(seen, nyToday());
        },
        cellRenderer: (p: { value: number | null; data: MonitoringResultRow }) => {
          if (p.value === null || p.value === undefined) return null;
          const seen = firstSeenByKey.get(`${msorId}:${p.data?.caseKey}`);
          // Predating the scan range is what makes a case "past unresolved" rather than newly
          // found: it was already open before this run went looking. Worth marking out, or a
          // widened scan is just a longer undifferentiated list.
          const predatesWindow = !!windowBegin && !!seen && seen < windowBegin;
          return (
            <span
              className={cn(
                "tabular-nums text-xs",
                predatesWindow && "rounded-sm bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400",
              )}
              title={predatesWindow
                ? `Open ${p.value} day${pluralS(p.value)} — first seen ${seen}, before this run's range`
                : `Open ${p.value} day${pluralS(p.value)}`}
            >
              {p.value}d
            </span>
          );
        },
      },
      {
        headerName: "Comments",
        colId: "comments",
        width: 130,
        suppressSizeToFit: true,
        filter: false,
        sortable: false,
        hide: !isVisible("comments"),
        cellRenderer: (p: { data: MonitoringResultRow }) => (
          <ViewCommentsButton
            msorId={msorId}
            caseKey={p.data.caseKey}
            activityCount={p.data.activityCount}
            caseLabel={caseLabelFor(p.data.data, p.data.rowId)}
          />
        ),
      },
    ];
    const data: ColDef[] = columns.map((col) => {
      const def: ColDef = {
        headerName: col,
        field: `data.${col}`,
        colId: `data.${col}`,
        valueGetter: (p: { data: MonitoringResultRow }) => {
          const v = p.data?.data?.[col];
          return v === null || v === undefined ? "" : String(v);
        },
        filter: DataGripSetFilter,
        sortable: true,
        resizable: true,
        minWidth: 120,
        hide: !isVisible(`data.${col}`),
      };
      if (isIncrementIdColumn(col)) {
        def.cellRenderer = (p: { data: MonitoringResultRow }) => (
          <IncrementIdLinkCell
            incrementId={String(p.data?.data?.[col] ?? "")}
            entityId={isShopLinkable(dbType) ? shopOrderEntityId(p.data?.data) : null}
          />
        );
      }
      return def;
    });
    return [...fixed, ...data];
  }, [columns, isVisible, onUpdateRow, dbType, msorId, firstSeenByKey, windowBegin]);

  // Visibility has to be asserted through the grid api: the `hide` colDef isn't
  // reliably re-applied once the grid has mounted. It is still set above so the
  // first paint is right and hidden columns never flash in. This asserts the
  // *whole* resolved set — auto-hidden and user-hidden alike — from one place, so
  // the empty-column rule and the picker can't fight over the api.
  const [gridReady, setGridReady] = useState(false);
  const visibility = useMemo(
    () => hideableCols.map((c) => ({ colId: c.colId, visible: isVisible(c.colId) })),
    [hideableCols, isVisible],
  );
  const visKey = visibility.map((v) => `${v.colId}:${v.visible}`).join("|");
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!gridReady || !api) return;
    const show = visibility.filter((v) => v.visible).map((v) => v.colId);
    const hide = visibility.filter((v) => !v.visible).map((v) => v.colId);
    if (show.length) api.setColumnsVisible(show, true);
    if (hide.length) api.setColumnsVisible(hide, false);
    // Re-fill the width — otherwise hiding a column leaves dead space on the right.
    api.sizeColumnsToFit();
  }, [gridReady, visKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowData = useMemo(() => rows, [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        No cases found for this date
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-2 py-1.5 border-b shrink-0 flex-wrap">
        <span className="text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-3">
          <ColumnPicker
            columns={hideableCols}
            overrides={overrides}
            autoHidden={autoHidden}
            onSetVisible={setVisible}
            onSetAll={setAll}
            onReset={reset}
          />
          <EmptyColumnsToggle count={emptyColumns.length} hidden={hideEmpty} onToggle={() => setHideEmpty((h) => !h)} />
          <ExcelExportButton gridApi={() => gridRef.current?.api} fileName={exportFileName} sheetName={exportSheetName} />
          <button
            onClick={() => gridRef.current?.api?.collapseAll()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronsUpDown className="h-3 w-3" />
            Collapse All
          </button>
        </div>
      </div>
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b shrink-0 bg-primary/5 flex-wrap">
          <span className="text-xs font-medium text-primary shrink-0">{selectedCount} selected</span>
          <select
            value=""
            onChange={(e) => { const v = e.target.value as RowStatus | ""; if (v) stageBulk({ status: v }); }}
            className="rounded border border-input bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">Change status…</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            type="text"
            value={bulkComment}
            onChange={(e) => setBulkComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyBulkComment(); } }}
            placeholder="Comment all + Enter"
            className="rounded border border-input bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring w-44"
          />
          <span className="text-xs text-muted-foreground shrink-0">Posts to each selected case</span>
          <button
            onClick={() => { gridRef.current?.api?.deselectAll(); setSelectedCount(0); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Deselect
          </button>
        </div>
      )}
      <div
        className="ag-theme-datagrip flex-1"
        style={{ width: "100%", height: "100%" }}
      >
        <AgGridReact
          ref={gridRef}
          theme="legacy"
          rowData={rowData}
          columnDefs={colDefs}
          rowHeight={24}
          headerHeight={26}
          rowSelection="multiple"
          suppressMovableColumns
          suppressCellFocus
          getRowId={(params) => String((params.data as MonitoringResultRow).rowId)}
          onSelectionChanged={handleSelectionChanged}
          onGridReady={(e: GridReadyEvent) => { setGridReady(true); e.api.sizeColumnsToFit(); }}
        />
      </div>
    </div>
  );
}

function StatusSelectCell({
  row,
  onUpdate,
}: {
  row: MonitoringResultRow;
  onUpdate: (rowId: number, status: RowStatus, comment: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as RowStatus;
    setSaving(true);
    try { await onUpdate(row.rowId, newStatus, row.rowComment); }
    finally { setSaving(false); }
  };
  return (
    <select
      value={row.rowStatus}
      onChange={handleChange}
      disabled={saving}
      className={cn(
        "text-xs rounded border px-1 py-0 outline-none cursor-pointer disabled:opacity-50 h-5 leading-none",
        statusSelectClass(row.rowStatus),
      )}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ── Case activity timeline ────────────────────────────────────────────────────
// The "Comments" column is a button that opens the case's activity timeline:
// comments, status changes, and (Phase 2) data-drift entries, keyed by
// (msorId, caseKey) so the thread persists as the case recurs across runs.

// A short, human label for a case — the order number when present, else #rowId.
function caseLabelFor(data: Record<string, unknown> | undefined, fallback: string | number): string {
  const raw = data?.increment_id ?? data?.INCREMENT_ID ?? data?.order_id ?? data?.entity_id;
  const s = raw == null ? "" : String(raw).trim();
  return s || `#${fallback}`;
}

// Prettify a status value ("OPEN" → "Open") for change entries; pass others through.
function activityValueLabel(v: string | null): string {
  if (v === null || v === "") return "—";
  return STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

// The author of an entry, split into a display name and the email that identifies them.
// `email` is null when it is absent, or when it is already serving as the name (users with
// no `name` attribute in Cognito) — so it is never printed twice.
function activityAuthor(activity: CaseActivity, fallbackName: string): { name: string; email: string | null } {
  const name = activity.authorName?.trim() || activity.authorEmail?.trim() || fallbackName;
  const email = activity.authorEmail?.trim() ?? null;
  return { name, email: email && email !== name ? email : null };
}

function ActivityEntry({ activity }: { activity: CaseActivity }) {
  const when = (() => {
    try { return format(parseISO(activity.createdAt), "MMM d, h:mm a"); } catch { return activity.createdAt; }
  })();

  if (activity.entryType === "COMMENT") {
    const { name, email } = activityAuthor(activity, "Unknown");
    return (
      <div className="text-sm">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-foreground">{name}</span>
          {email && <span className="min-w-0 truncate text-xs text-muted-foreground">{email}</span>}
          <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground/90">{activity.commentText}</p>
      </div>
    );
  }

  const isStatus = activity.entryType === "STATUS_CHANGE";
  // Change entries are one-liners, so the email rides along as a tooltip rather than inline.
  const { name: who, email } = activityAuthor(activity, "System");
  const Icon = isStatus ? Activity : RefreshCw;
  const field = isStatus ? "status" : (activity.fieldName ?? "field");
  const before = isStatus ? activityValueLabel(activity.oldValue) : (activity.oldValue ?? "—");
  const after = isStatus ? activityValueLabel(activity.newValue) : (activity.newValue ?? "—");
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 text-muted-foreground">
        <span className="text-foreground/80" title={email ?? undefined}>{who}</span>{" "}
        changed <span className="font-medium">{field}</span>{" "}
        <span className="text-foreground/70">{before} → {after}</span>
        <span className="ml-2 text-xs">{when}</span>
      </div>
    </div>
  );
}

function CaseActivityModal({
  msorId,
  caseKey,
  caseLabel,
  onClose,
  onPosted,
}: {
  msorId: number;
  caseKey: string;
  caseLabel: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [items, setItems] = useState<CaseActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setItems(null);
    fetchCaseActivity(msorId, caseKey)
      .then((data) => { if (alive) setItems(data); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load activity"); });
    return () => { alive = false; };
  }, [msorId, caseKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [items]);

  async function submit() {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const created = await addCaseComment(msorId, caseKey, text);
      setItems((prev) => [...(prev ?? []), created]);
      setDraft("");
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border bg-background shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold truncate">Comments &amp; activity — {caseLabel}</h2>
          </div>
          <button onClick={onClose} title="Close" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="flex-1 min-h-[8rem] overflow-y-auto px-4 py-3 space-y-3">
          {(() => {
            if (error && items === null) return <p className="text-sm text-destructive">{error}</p>;
            if (items === null) return <p className="text-sm text-muted-foreground">Loading…</p>;
            if (items.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No comments or activity yet.<br />Add the first comment below.</p>;
            return items.map((a) => <ActivityEntry key={a.activityId} activity={a} />);
          })()}
        </div>

        <div className="border-t p-3 shrink-0">
          {error && items !== null && <p className="mb-2 text-xs text-destructive">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              placeholder="Write a comment…  (Enter to send, Shift+Enter for a new line)"
              rows={2}
              className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={() => void submit()}
              disabled={!draft.trim() || posting}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              {posting ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ViewCommentsButton({
  msorId,
  caseKey,
  activityCount,
  caseLabel,
}: {
  msorId: number;
  caseKey: string;
  activityCount: number;
  caseLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(activityCount);
  useEffect(() => { setCount(activityCount); }, [activityCount]);

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="View comments & activity"
        className="flex items-center gap-1 rounded border border-input bg-background px-1.5 h-5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
      >
        <MessageSquare className="h-3 w-3 shrink-0" />
        {count > 0 ? <span className="tabular-nums">{count}</span> : <span>Comment</span>}
      </button>
      {open && (
        <CaseActivityModal
          msorId={msorId}
          caseKey={caseKey}
          caseLabel={caseLabel}
          onClose={() => setOpen(false)}
          onPosted={() => setCount((c) => c + 1)}
        />
      )}
    </>
  );
}

// ── Edit query modal ──────────────────────────────────────────────────────────

function EditQueryModal({
  query,
  categoryOptions,
  defaultColor,
  onClose,
  onSaved,
}: Readonly<{
  query: MonitoringQuery;
  categoryOptions: string[];
  defaultColor: string;
  onClose: () => void;
  onSaved: (updated: MonitoringQuery) => void;
}>) {
  const [form, setForm] = useState({
    title: query.title,
    description: query.description ?? "",
    dbType: query.dbType,
    category: query.category ?? CATEGORY_FALLBACK,
    sheetName: query.sheetName ?? "",
    ownerName: query.ownerName ?? "",
    ownerEmail: query.ownerEmail ?? "",
    queryInterval: query.queryInterval ?? "",
    recipients: query.recipients ?? "",
    sqlQuery: query.sqlQuery,
    activeYn: query.activeYn,
    frequentYn: query.frequentYn,
    onHoldYn: query.onHoldYn,
    color: query.color ?? defaultColor,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateQuery(query.msorId, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        dbType: form.dbType.trim(),
        category: form.category.trim() || CATEGORY_FALLBACK,
        sheetName: form.sheetName.trim() || null,
        ownerName: form.ownerName.trim() || null,
        ownerEmail: form.ownerEmail.trim() || null,
        queryInterval: form.queryInterval.trim() || null,
        recipients: form.recipients.trim() || null,
        sqlQuery: form.sqlQuery,
        activeYn: form.activeYn,
        frequentYn: form.frequentYn,
        onHoldYn: form.onHoldYn,
        color: form.color || null,
      });
      onSaved({
        ...query,
        title: form.title.trim(),
        description: form.description.trim() || null,
        dbType: form.dbType.trim(),
        category: form.category.trim() || CATEGORY_FALLBACK,
        sheetName: form.sheetName.trim() || null,
        ownerName: form.ownerName.trim() || null,
        ownerEmail: form.ownerEmail.trim() || null,
        queryInterval: form.queryInterval.trim() || null,
        recipients: form.recipients.trim() || null,
        sqlQuery: form.sqlQuery,
        activeYn: form.activeYn,
        frequentYn: form.frequentYn,
        onHoldYn: form.onHoldYn,
        color: form.color || null,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-2xl rounded-lg border bg-background shadow-xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Edit Monitoring Item</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form id="edit-query-form" onSubmit={(e) => handleSubmit(e)} className="overflow-y-auto flex-1">
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Title</label>
                <input className={fieldClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Monitoring item title" required />
              </div>
              <div>
                <label className={labelClass}>DB Type</label>
                <select className={fieldClass} value={form.dbType} onChange={(e) => setForm((f) => ({ ...f, dbType: e.target.value }))}>
                  {ALL_DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input className={fieldClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="edit-category">Category</label>
                <input id="edit-category" className={fieldClass} list="edit-category-options" maxLength={50} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Pick or type a new category" />
                <datalist id="edit-category-options">
                  {categoryOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className={labelClass}>Sheet Name</label>
                <input className={fieldClass} value={form.sheetName} onChange={(e) => setForm((f) => ({ ...f, sheetName: e.target.value }))} placeholder="Excel sheet name for reports" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Owner Name</label>
                <input className={fieldClass} value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} placeholder="e.g. John Doe" />
              </div>
              <div>
                <label className={labelClass}>Owner Email</label>
                <input type="email" className={fieldClass} value={form.ownerEmail} onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))} placeholder="e.g. john@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Query Interval</label>
                <input className={fieldClass} value={form.queryInterval} onChange={(e) => setForm((f) => ({ ...f, queryInterval: e.target.value }))} placeholder="e.g. 0 9 * * *" />
              </div>
              <div>
                <label className={labelClass}>Recipients</label>
                <input className={fieldClass} value={form.recipients} onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))} placeholder="Comma-separated emails" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Active</label>
                <select className={fieldClass} value={form.activeYn} onChange={(e) => setForm((f) => ({ ...f, activeYn: e.target.value as "Y" | "N" }))}>
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Frequent</label>
                <select className={fieldClass} value={form.frequentYn} onChange={(e) => setForm((f) => ({ ...f, frequentYn: e.target.value as "Y" | "N" }))}>
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-onhold" title="On-hold items are excluded from dashboard totals/status">On Hold</label>
                <select id="edit-onhold" className={fieldClass} value={form.onHoldYn} onChange={(e) => setForm((f) => ({ ...f, onHoldYn: e.target.value as "Y" | "N" }))}>
                  <option value="N">No</option>
                  <option value="Y">Yes</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={form.color || "#4f46e5"} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-0.5" />
                <input type="text" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} placeholder="#rrggbb" maxLength={7} className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring" />
                {form.color && <button type="button" onClick={() => setForm((f) => ({ ...f, color: "" }))} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"><X className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
            <div>
              <label className={labelClass}>SQL Query</label>
              <textarea className={cn(fieldClass, "font-mono text-xs resize-none")} rows={8} value={form.sqlQuery} onChange={(e) => setForm((f) => ({ ...f, sqlQuery: e.target.value }))} spellCheck={false} required />
            </div>
            {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
          </div>
        </form>
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer">Cancel</button>
          <button type="submit" form="edit-query-form" disabled={saving} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Run selection modal ───────────────────────────────────────────────────────

function RunSelectionModal({
  queries,
  queryColorMap,
  initialSelected,
  onClose,
  onRun,
}: {
  queries: MonitoringQuery[];
  queryColorMap: Record<number, string>;
  initialSelected: Set<number>;
  onClose: () => void;
  onRun: (ids: number[]) => Promise<void>;
}) {
  const active = queries.filter((q) => q.activeYn === "Y");
  const [selected, setSelected] = useState<Set<number>>(
    () => initialSelected.size > 0 ? new Set(initialSelected) : new Set(active.map((q) => q.msorId)),
  );
  const [running, setRunning] = useState(false);
  const allSelected = active.length > 0 && selected.size === active.length;

  function toggle(id: number) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function handleRun() {
    if (selected.size === 0) return;
    setRunning(true);
    try { await onRun(Array.from(selected)); }
    finally { setRunning(false); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-lg border bg-background shadow-xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Run Monitoring Items</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-1">
          <label className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-accent transition-colors cursor-pointer text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(active.map((q) => q.msorId)))} className="cursor-pointer" />
            Select All
          </label>
          <div className="border-t my-2" />
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active monitoring items</p>
          ) : (
            active.map((q) => (
              <label key={q.msorId} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-accent transition-colors cursor-pointer">
                <input type="checkbox" checked={selected.has(q.msorId)} onChange={() => toggle(q.msorId)} className="cursor-pointer" />
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: queryColorMap[q.msorId] ?? QUERY_COLORS[0] }} />
                <span className="text-sm truncate flex-1">{q.title}</span>
              </label>
            ))
          )}
        </div>
        <div className="flex justify-between items-center gap-2 px-6 py-4 border-t shrink-0">
          <span className="text-xs text-muted-foreground">{selected.size} of {active.length} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer">Cancel</button>
            <button type="button" onClick={() => handleRun()} disabled={selected.size === 0 || running} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <Play className="h-3.5 w-3.5" />
              {running ? "Running…" : "Run Selected"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({ query, deleting, onClose, onConfirm }: { query: MonitoringQuery; deleting: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-sm rounded-lg border bg-background shadow-xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Delete Monitoring Item</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground">Are you sure you want to delete <span className="font-medium text-foreground">"{query.title}"</span>? This will permanently remove the item and all its execution history.</p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={deleting} className="rounded-md bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">{deleting ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Create query modal ────────────────────────────────────────────────────────

function CreateQueryModal({ categoryOptions, onClose, onCreated }: Readonly<{ categoryOptions: string[]; onClose: () => void; onCreated: (created: MonitoringQuery) => void }>) {
  const [form, setForm] = useState({
    title: "", description: "", dbType: "DATABASE1", category: "", sheetName: "", ownerName: "", ownerEmail: "",
    queryInterval: "", recipients: "", sqlQuery: "", activeYn: "Y" as "Y" | "N", frequentYn: "N" as "Y" | "N", onHoldYn: "N" as "Y" | "N",
    color: QUERY_COLORS[Math.floor(Math.random() * QUERY_COLORS.length)],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createQuery({
        title: form.title.trim(), description: form.description.trim() || null,
        dbType: form.dbType.trim(), category: form.category.trim() || CATEGORY_FALLBACK, sheetName: form.sheetName.trim(),
        ownerName: form.ownerName.trim() || null, ownerEmail: form.ownerEmail.trim() || null,
        queryInterval: form.queryInterval.trim(), recipients: form.recipients.trim(),
        sqlQuery: form.sqlQuery, activeYn: form.activeYn, frequentYn: form.frequentYn, onHoldYn: form.onHoldYn,
        color: form.color || null,
      });
      onCreated(created);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-2xl rounded-lg border bg-background shadow-xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Create Monitoring Item</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <form id="create-query-form" onSubmit={(e) => handleSubmit(e)} className="overflow-y-auto flex-1">
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Title</label>
                <input className={fieldClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Monitoring item title" required />
              </div>
              <div>
                <label className={labelClass}>DB Type</label>
                <select className={fieldClass} value={form.dbType} onChange={(e) => setForm((f) => ({ ...f, dbType: e.target.value }))}>
                  {ALL_DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input className={fieldClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="create-category">Category</label>
                <input id="create-category" className={fieldClass} list="create-category-options" maxLength={50} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Pick or type a new category" />
                <datalist id="create-category-options">
                  {categoryOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className={labelClass}>Sheet Name</label>
                <input className={fieldClass} value={form.sheetName} onChange={(e) => setForm((f) => ({ ...f, sheetName: e.target.value }))} placeholder="Excel sheet name for reports" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Owner Name</label>
                <input className={fieldClass} value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} placeholder="e.g. John Doe" />
              </div>
              <div>
                <label className={labelClass}>Owner Email</label>
                <input type="email" className={fieldClass} value={form.ownerEmail} onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))} placeholder="e.g. john@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Query Interval</label>
                <input className={fieldClass} value={form.queryInterval} onChange={(e) => setForm((f) => ({ ...f, queryInterval: e.target.value }))} placeholder="e.g. 0 9 * * *" required />
              </div>
              <div>
                <label className={labelClass}>Recipients</label>
                <input className={fieldClass} value={form.recipients} onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))} placeholder="Comma-separated emails" required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Active</label>
                <select className={fieldClass} value={form.activeYn} onChange={(e) => setForm((f) => ({ ...f, activeYn: e.target.value as "Y" | "N" }))}>
                  <option value="Y">Yes</option><option value="N">No</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Frequent</label>
                <select className={fieldClass} value={form.frequentYn} onChange={(e) => setForm((f) => ({ ...f, frequentYn: e.target.value as "Y" | "N" }))}>
                  <option value="Y">Yes</option><option value="N">No</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="create-onhold" title="On-hold items are excluded from dashboard totals/status">On Hold</label>
                <select id="create-onhold" className={fieldClass} value={form.onHoldYn} onChange={(e) => setForm((f) => ({ ...f, onHoldYn: e.target.value as "Y" | "N" }))}>
                  <option value="N">No</option><option value="Y">Yes</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={form.color || "#4f46e5"} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-0.5" />
                <input type="text" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} placeholder="#rrggbb (optional)" maxLength={7} className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring" />
                {form.color && <button type="button" onClick={() => setForm((f) => ({ ...f, color: "" }))} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"><X className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
            <div>
              <label className={labelClass}>SQL Query</label>
              <textarea className={cn(fieldClass, "font-mono text-xs resize-none")} rows={8} value={form.sqlQuery} onChange={(e) => setForm((f) => ({ ...f, sqlQuery: e.target.value }))} spellCheck={false} required />
            </div>
            {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
          </div>
        </form>
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer">Cancel</button>
          <button type="submit" form="create-query-form" disabled={saving} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">{saving ? "Creating…" : "Create"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Query history modal ───────────────────────────────────────────────────────

function QueryHistoryModal({ query, results, onClose }: { query: MonitoringQuery; results: MonitoringResult[]; onClose: () => void }) {
  const [expandedId, setExpandedId] = useState<number | null>(results.length > 0 ? results[results.length - 1].resultId : null);
  const sorted = [...results].reverse();

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close on backdrop mousedown, not click: a mouseup that lands here after selecting SQL
  // text inside the card is not a request to close.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={onClose}>
      <div
        className="relative w-full max-w-2xl rounded-lg border bg-background shadow-xl mx-4 max-h-[85vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-semibold">Query History</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">{query.title}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">No execution history yet</div>
          ) : (
            sorted.map((r) => {
              const isOpen = expandedId === r.resultId;
              return (
                <div key={r.resultId} className="rounded-md border overflow-hidden">
                  <button onClick={() => setExpandedId(isOpen ? null : r.resultId)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors cursor-pointer">
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    <span className="text-sm font-medium flex-1">{formatFullDate(r.runDate)}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {r.triggeredAlertYn === "Y" && <Badge variant="warning" className="text-xs">Alert sent</Badge>}
                      <span className="text-xs text-muted-foreground">{r.resultCount} {r.resultCount === 1 ? "case" : "cases"}</span>
                      {r.executionMs != null && <span className="text-xs text-muted-foreground">{r.executionMs} ms</span>}
                      <StatusBadge status={r.resultStatus} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
                      {r.resultStatus === "FAIL" && r.errorMessage && <ErrorPanel message={r.errorMessage} detail={r.errorDetail} pastUnresolved={r.pastUnresolvedYn === "Y"} />}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">SQL Query</p>
                        <pre className="overflow-x-auto rounded-md bg-background border px-3 py-2.5 text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">{query.sqlQuery}</pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Search result row ─────────────────────────────────────────────────────────

function SearchResultRow({
  query, color, count, isFailed, checked,
  onToggleCheck, onSelect, onRun, onEdit, onDelete,
}: {
  query: MonitoringQuery; color: string; count: number | null; isFailed: boolean; checked: boolean;
  onToggleCheck: () => void; onSelect: () => void; onRun: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 144 });
    setMenuOpen((o) => !o);
  }

  return (
    <li className="group flex items-center hover:bg-accent transition-colors">
      <div className="pl-4 pr-2 py-2.5 flex items-center shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onToggleCheck(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onToggleCheck(); } }}>
        <input type="checkbox" checked={checked} onChange={onToggleCheck} onClick={(e) => e.stopPropagation()} className="cursor-pointer" />
      </div>
      <button onMouseDown={(e) => e.preventDefault()} onClick={onSelect} className="flex flex-1 items-center gap-3 py-2.5 text-sm cursor-pointer text-left min-w-0">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
        <span className="flex-1 truncate">{query.title}</span>
        {query.dbType && <Badge variant="outline" className="text-xs shrink-0">{query.dbType}</Badge>}
        {isFailed && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
        {!isFailed && count !== null && count > 0 && <Badge variant="destructive" className="shrink-0 text-xs">{count}</Badge>}
      </button>
      <button ref={triggerRef} onMouseDown={(e) => e.preventDefault()} onClick={openMenu} className={cn("shrink-0 mr-2 rounded p-1 transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 focus:opacity-100", menuOpen && "opacity-100")} title="More options">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {menuOpen && createPortal(
        <div style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }} className="w-36 rounded-md border bg-background shadow-lg py-0.5" onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => { setMenuOpen(false); onRun(); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"><Zap className="h-3.5 w-3.5" />Run Now</button>
          <button onClick={() => { setMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"><Pencil className="h-3.5 w-3.5" />Edit</button>
          <button onClick={() => { setMenuOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-accent transition-colors cursor-pointer rounded-sm"><Trash2 className="h-3.5 w-3.5" />Delete</button>
        </div>,
        document.body,
      )}
    </li>
  );
}

// ── Global search bar ─────────────────────────────────────────────────────────

function GlobalSearch({
  queries, queryColorMap, latestMap, checkedIds,
  onToggleCheck, onSelect, onRun, onEdit, onDelete,
}: {
  queries: MonitoringQuery[];
  queryColorMap: Record<number, string>;
  latestMap: Record<number, MonitoringResult | null>;
  checkedIds: Set<number>;
  onToggleCheck: (id: number) => void;
  onSelect: (q: MonitoringQuery) => void;
  onRun: (id: number) => void;
  onEdit: (q: MonitoringQuery) => void;
  onDelete: (q: MonitoringQuery) => void;
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return queries.filter((query) =>
      query.title.toLowerCase().includes(q) ||
      query.description?.toLowerCase().includes(q) ||
      query.dbType?.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [queries, value]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input ref={inputRef} type="text" value={value} onChange={(e) => { setValue(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search monitoring items…" className="w-full rounded-lg border border-input bg-background pl-10 pr-9 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring shadow-sm" />
        {value && <button onClick={() => { setValue(""); inputRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {open && value && (
        <div className="absolute top-full mt-1.5 w-full rounded-lg border bg-background shadow-lg z-50 overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No items match &ldquo;{value}&rdquo;</p>
          ) : (
            <ul>
              {results.map((q) => {
                const latest = latestMap[q.msorId];
                return (
                  <SearchResultRow
                    key={q.msorId} query={q} color={queryColorMap[q.msorId] ?? QUERY_COLORS[0]}
                    count={latest?.resultCount ?? null} isFailed={latest?.resultStatus === "FAIL"}
                    checked={checkedIds.has(q.msorId)} onToggleCheck={() => onToggleCheck(q.msorId)}
                    onSelect={() => { setValue(""); setOpen(false); onSelect(q); }}
                    onRun={() => { onRun(q.msorId); setOpen(false); setValue(""); }}
                    onEdit={() => { onEdit(q); setOpen(false); setValue(""); }}
                    onDelete={() => { onDelete(q); setOpen(false); setValue(""); }}
                  />
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── All Cases page ────────────────────────────────────────────────────────────

function buildAllCasesColDefs(opts: {
  dataColumns: string[];
  isVisible: (colId: string) => boolean;
  queries: MonitoringQuery[];
  queryColorMap: Record<number, string>;
  categoryByMsor: Record<number, string>;
  onSelectQuery: (q: MonitoringQuery) => void;
  onSelectCategory: (cat: string) => void;
  handleChangeRow: (rowId: number, status: RowStatus, comment: string | null) => Promise<void>;
}): ColDef[] {
  const { dataColumns, isVisible, queries, queryColorMap, categoryByMsor, onSelectQuery, onSelectCategory, handleChangeRow } = opts;
    const fixed: ColDef[] = [
      {
        headerCheckboxSelection: true,
        checkboxSelection: true,
        width: 36,
        maxWidth: 36,
        pinned: "left",
        sortable: false,
        filter: false,
        resizable: false,
        suppressSizeToFit: true,
        headerName: "",
      },
      {
        headerName: "#",
        valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
        width: 44,
        minWidth: 44,
        maxWidth: 44,
        pinned: "left",
        sortable: false,
        suppressSizeToFit: true,
        cellClass: "text-center text-xs text-muted-foreground tabular-nums",
      },
      {
        headerName: "Status",
        field: "rowStatus",
        colId: "rowStatus",
        width: 150,
        suppressSizeToFit: true,
        filter: DataGripSetFilter,
        cellRenderer: (p: { data: AllCasesRow }) => (
          <StatusSelectCell row={p.data as unknown as MonitoringResultRow} onUpdate={handleChangeRow} />
        ),
      },
      {
        headerName: "Comments",
        colId: "comments",
        width: 130,
        suppressSizeToFit: true,
        filter: false,
        sortable: false,
        hide: !isVisible("comments"),
        cellRenderer: (p: { data: AllCasesRow }) => (
          <ViewCommentsButton
            msorId={p.data.msorId}
            caseKey={p.data.caseKey}
            activityCount={p.data.activityCount}
            caseLabel={caseLabelFor(p.data.data, p.data.rowId)}
          />
        ),
      },
      {
        headerName: "Category",
        colId: "category",
        width: 150,
        suppressSizeToFit: true,
        filter: DataGripSetFilter,
        sortable: true,
        hide: !isVisible("category"),
        valueGetter: (p: { data: AllCasesRow }) => categoryByMsor[p.data.msorId] ?? CATEGORY_FALLBACK,
        cellRenderer: (p: { data: AllCasesRow }) => {
          const cat = categoryByMsor[p.data.msorId] ?? CATEGORY_FALLBACK;
          return (
            <HoverDescription text={categoryDescription(cat) ?? ""}>
              <button
                onClick={() => onSelectCategory(cat)}
                className="text-xs text-primary hover:underline cursor-pointer truncate max-w-full text-left"
                title={cat}
              >
                <span
                  className="inline-block w-2 h-2 rounded-sm mr-1.5 shrink-0 align-middle"
                  style={{ backgroundColor: categoryColor(cat) }}
                />
                {cat}
              </button>
            </HoverDescription>
          );
        },
      },
      {
        headerName: "Item",
        field: "title",
        colId: "title",
        width: 200,
        suppressSizeToFit: true,
        filter: DataGripSetFilter,
        sortable: true,
        hide: !isVisible("title"),
        cellRenderer: (p: { data: AllCasesRow }) => {
          const q = queries.find((q) => q.msorId === p.data.msorId);
          return (
            <HoverDescription text={q?.description ?? ""}>
              <button
                onClick={() => q && onSelectQuery(q)}
                className="text-xs text-primary hover:underline cursor-pointer truncate max-w-full text-left"
                title={p.data.title}
              >
                <span
                  className="inline-block w-2 h-2 rounded-sm mr-1.5 shrink-0 align-middle"
                  style={{ backgroundColor: queryColorMap[p.data.msorId] ?? "#6b7280" }}
                />
                {p.data.title}
              </button>
            </HoverDescription>
          );
        },
      },
      {
        headerName: "DB Type",
        field: "dbType",
        colId: "dbType",
        width: 110,
        suppressSizeToFit: true,
        filter: DataGripSetFilter,
        sortable: true,
        hide: !isVisible("dbType"),
      },
      {
        headerName: "First Seen",
        field: "runDate",
        colId: "runDate",
        width: 140,
        suppressSizeToFit: true,
        filter: DataGripSetFilter,
        sortable: true,
        sort: "desc",
        hide: !isVisible("runDate"),
        cellRenderer: renderFirstSeenCell,
      },
    ];
    const data: ColDef[] = dataColumns.map((col) => {
      const def: ColDef = {
        headerName: col,
        field: `data.${col}`,
        colId: `data.${col}`,
        valueGetter: (p: { data: AllCasesRow }) => {
          const v = p.data?.data?.[col];
          return v === null || v === undefined ? "" : String(v);
        },
        filter: DataGripSetFilter,
        sortable: true,
        resizable: true,
        minWidth: 120,
        hide: !isVisible(`data.${col}`),
      };
      if (isIncrementIdColumn(col)) {
        def.cellRenderer = (p: { data: AllCasesRow }) => (
          <IncrementIdLinkCell
            incrementId={String(p.data?.data?.[col] ?? "")}
            entityId={isShopLinkable(p.data?.dbType) ? shopOrderEntityId(p.data?.data) : null}
          />
        );
      }
      return def;
    });
    return [...fixed, ...data];
}

function AllCasesPage({
  queries,
  queryColorMap,
  onSelectQuery,
  onSelectCategory,
  lockedCategory,
  lockedCaseKeys,
  onRowsSaved,
  embedded = false,
}: Readonly<{
  queries: MonitoringQuery[];
  queryColorMap: Record<number, string>;
  onSelectQuery: (q: MonitoringQuery) => void;
  onSelectCategory: (cat: string) => void;
  lockedCategory?: string;
  /**
   * Restricts the grid to a set of `${msorId}:${caseKey}` identities — the KPI drill-down.
   * Like `lockedCategory` it is applied client-side and is not clearable from the filter bar,
   * so the grid's row count always equals the total of the pie that opened it.
   */
  lockedCaseKeys?: ReadonlySet<string>;
  /** Fired after a save commits, so a parent showing derived counts can refresh them. */
  onRowsSaved?: () => void;
  embedded?: boolean;
}>) {
  const [rows, setRows] = useState<AllCasesRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterDbType, setFilterDbType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterMsorId, setFilterMsorId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState(lockedCategory ?? "");

  // "New Today" pins the range to today. The previous range is stashed so turning the
  // chip off restores it rather than clearing it.
  const [newTodayOnly, setNewTodayOnly] = useState(false);
  const stashedRange = useRef({ from: "", to: "" });

  function toggleNewToday() {
    if (newTodayOnly) {
      setNewTodayOnly(false);
      setFilterFromDate(stashedRange.current.from);
      setFilterToDate(stashedRange.current.to);
      return;
    }
    stashedRange.current = { from: filterFromDate, to: filterToDate };
    const today = nyToday();
    setNewTodayOnly(true);
    setFilterFromDate(today);
    setFilterToDate(today);
  }

  function clearFilters() {
    setFilterDbType("");
    setFilterStatus("");
    setFilterMsorId(null);
    setFilterCategory(lockedCategory ?? "");
    setFilterFromDate("");
    setFilterToDate("");
    setNewTodayOnly(false);
    stashedRange.current = { from: "", to: "" };
  }

  // msorId → category, derived from the queries list (rows don't carry category).
  const categoryByMsor = useMemo(
    () => Object.fromEntries(queries.map((q) => [q.msorId, q.category ?? CATEGORY_FALLBACK])),
    [queries],
  );

  const [draftRows, setDraftRows] = useState<Record<number, { rowStatus: RowStatus; rowComment: string | null }>>({});
  const [saving, setSaving] = useState(false);

  const [acSelectedCount, setAcSelectedCount] = useState(0);
  const [acBulkComment, setAcBulkComment] = useState("");
  const [hideEmptyCols, setHideEmptyCols] = useState(true);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllResultRows({
        dbType: filterDbType || undefined,
        rowStatus: filterStatus || undefined,
        fromDate: filterFromDate || undefined,
        toDate: filterToDate || undefined,
        msorId: filterMsorId ?? undefined,
      });
      setRows(data);
    } catch (e) {
      console.error("Failed to load all cases rows", e);
    } finally {
      setLoading(false);
    }
  }, [filterDbType, filterStatus, filterFromDate, filterToDate, filterMsorId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const effectiveRows = useMemo(
    () => rows.map((r) => ({ ...r, ...(draftRows[r.rowId] ?? {}) })),
    [rows, draftRows],
  );

  // Category and case-key locks are filtered client-side (the backend endpoint has neither
  // param). Every other filter still composes on top, so "Alice's IN_PROGRESS cases in
  // Category X" works without any of them knowing about the others.
  const displayedRows = useMemo(() => {
    let out = effectiveRows;
    if (lockedCaseKeys) out = out.filter((r) => lockedCaseKeys.has(`${r.msorId}:${r.caseKey}`));
    if (filterCategory) out = out.filter((r) => (categoryByMsor[r.msorId] ?? CATEGORY_FALLBACK) === filterCategory);
    return out;
  }, [effectiveRows, filterCategory, categoryByMsor, lockedCaseKeys]);

  // Categories present among the loaded rows, in taxonomy order.
  const categoriesInRows = useMemo(() => {
    const present = new Set(rows.map((r) => categoryByMsor[r.msorId] ?? CATEGORY_FALLBACK));
    return [...present].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
  }, [rows, categoryByMsor]);

  const hasUnsavedChanges = Object.keys(draftRows).length > 0;

  const handleChangeRow = useCallback(async (rowId: number, status: RowStatus, comment: string | null) => {
    setDraftRows((prev) => {
      const original = rows.find((r) => r.rowId === rowId);
      if (!original) return prev;
      if (status === original.rowStatus && comment === original.rowComment) {
        const { [rowId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [rowId]: { rowStatus: status, rowComment: comment } };
    });
  }, [rows]);

  const handleSave = useCallback(async () => {
    if (Object.keys(draftRows).length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(draftRows).map(([rowIdStr, change]) =>
          updateRow(Number(rowIdStr), change.rowStatus, change.rowComment),
        ),
      );
      const snapshot = draftRows;
      setRows((prev) => prev.map((r) => (snapshot[r.rowId] ? { ...r, ...snapshot[r.rowId] } : r)));
      setDraftRows({});
      // Once per save, not once per row: a 50-case bulk apply issues 50 PATCHes but must
      // only trigger one refresh of whatever derives counts from these rows.
      onRowsSaved?.();
    } finally {
      setSaving(false);
    }
  }, [draftRows, onRowsSaved]);

  const handleAcSelectionChanged = useCallback(() => {
    setAcSelectedCount(gridRef.current?.api?.getSelectedRows().length ?? 0);
  }, []);

  // Bulk edits stage into the same draft buffer as inline edits, so the single
  // "Save Changes" button commits everything together. Selecting a status
  // applies it immediately to the selection; typing a comment stages on Enter
  // or blur. A staged change that matches the original row drops the draft.
  const stageAcBulk = useCallback((changes: BulkRowChange) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const ids = (api.getSelectedRows() as AllCasesRow[]).map((r) => r.rowId);
    if (ids.length === 0) return;
    setDraftRows((prev) => {
      const byId = new Map(rows.map((r) => [r.rowId, r]));
      const next = { ...prev };
      for (const id of ids) {
        const base = byId.get(id);
        if (!base) continue;
        const current = next[id];
        const status = changes.status ?? current?.rowStatus ?? base.rowStatus;
        const comment = "comment" in changes ? (changes.comment ?? null) : (current?.rowComment ?? base.rowComment);
        if (status === base.rowStatus && comment === base.rowComment) delete next[id];
        else next[id] = { rowStatus: status, rowComment: comment };
      }
      return next;
    });
  }, [rows]);

  // Bulk comment posts to every selected case's activity thread (append-only).
  // Status bulk-edits still stage into "Save Changes" via stageAcBulk.
  const applyAcBulkComment = useCallback(async () => {
    const c = acBulkComment.trim();
    if (!c) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const selected = api.getSelectedRows() as AllCasesRow[];
    if (selected.length === 0) return;
    setAcBulkComment("");
    try {
      await Promise.all(selected.map((r) => addCaseComment(r.msorId, r.caseKey, c)));
      selected.forEach((r) => { r.activityCount = (r.activityCount ?? 0) + 1; });
      api.refreshCells({ force: true });
    } catch (e) {
      console.error("Failed to post bulk comment", e);
    }
  }, [acBulkComment]);

  // Columns + emptiness are scoped to the category in view. Category is filtered
  // client-side, so the backend `rows` span every category; without scoping, a
  // column populated only in another category would keep an all-blank column
  // visible on a category page. (Uses base rows, not draft-merged effectiveRows,
  // so editing a comment doesn't churn the column set.)
  const scopedRows = useMemo(
    () => (filterCategory
      ? rows.filter((r) => (categoryByMsor[r.msorId] ?? CATEGORY_FALLBACK) === filterCategory)
      : rows),
    [rows, filterCategory, categoryByMsor],
  );

  const dataColumns = useMemo(
    () => Array.from(new Set(scopedRows.flatMap((r) => Object.keys(r.data)))),
    [scopedRows],
  );

  // Data columns blank for every row in scope — collapsed by default.
  const emptyDataColumns = useMemo(() => findEmptyDataColumns(dataColumns, scopedRows), [dataColumns, scopedRows]);

  // One key for every category, not one per category: overrides are keyed by
  // column name and unknown names are ignored, so hiding a column hides it
  // wherever it turns up — which is what "I don't want to see this" means. The
  // auto-hide-empty default stays category-scoped underneath it.
  const { overrides, setVisible, setAll, reset } = useColumnVisibility("msor.cols.v1.allcases");

  // The auto rule, keyed by colId so it composes with the picker's overrides.
  const autoHidden = useMemo(
    () => new Set(hideEmptyCols ? emptyDataColumns.map((c) => `data.${c}`) : []),
    [hideEmptyCols, emptyDataColumns],
  );

  const hideableCols = useMemo<HideableCol[]>(() => {
    const emptySet = new Set(emptyDataColumns);
    return [
      ...ALL_CASES_META_COLUMNS,
      ...dataColumns.map((c) => ({ colId: `data.${c}`, label: c, empty: emptySet.has(c) })),
    ];
  }, [dataColumns, emptyDataColumns]);

  const isVisible = useCallback(
    (colId: string) => resolveVisible(colId, overrides, autoHidden),
    [overrides, autoHidden],
  );

  const colDefs = useMemo<ColDef[]>(
    () => buildAllCasesColDefs({
      dataColumns,
      isVisible,
      queries, queryColorMap, categoryByMsor, onSelectQuery, onSelectCategory, handleChangeRow,
    }),
    [dataColumns, isVisible, handleChangeRow, queries, onSelectQuery, onSelectCategory, queryColorMap, categoryByMsor],
  );

  const gridRef = useRef<AgGridReact>(null);

  // Visibility is asserted through the grid api (the `hide` colDef isn't reliably
  // re-applied once the grid has mounted), and the *whole* resolved set is asserted
  // from one place so the empty-column rule and the picker can't fight over it.
  const [gridReady, setGridReady] = useState(false);
  const visibility = useMemo(
    () => hideableCols.map((c) => ({ colId: c.colId, visible: isVisible(c.colId) })),
    [hideableCols, isVisible],
  );
  const visKey = visibility.map((v) => `${v.colId}:${v.visible}`).join("|");
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!gridReady || !api) return;
    const show = visibility.filter((v) => v.visible).map((v) => v.colId);
    const hide = visibility.filter((v) => !v.visible).map((v) => v.colId);
    if (show.length) api.setColumnsVisible(show, true);
    if (hide.length) api.setColumnsVisible(hide, false);
    // Re-fill the width — otherwise hiding a column leaves dead space on the right.
    api.sizeColumnsToFit();
  }, [gridReady, visKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={cn("shrink-0 space-y-4", embedded ? "px-8 pt-2 pb-4" : "px-8 pt-8 pb-4")}>
        {!embedded && (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">All Cases</h1>
                <InfoPopover text={ALL_CASES_DESCRIPTION} />
              </div>
              {!loading && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {displayedRows.length} row{displayedRows.length !== 1 ? "s" : ""}
                  {filterCategory ? ` in ${filterCategory}` : " across all monitoring items"}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* DB type */}
          <select
            value={filterDbType}
            onChange={(e) => setFilterDbType(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">All DB Types</option>
            {ALL_DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Row status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="DONE">Done</option>
          </select>

          {/* Item filter */}
          <select
            value={filterMsorId ?? ""}
            onChange={(e) => setFilterMsorId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring cursor-pointer max-w-[200px]"
          >
            <option value="">All Items</option>
            {queries.map((q) => <option key={q.msorId} value={q.msorId}>{q.title}</option>)}
          </select>

          {/* Category filter (hidden when the page is locked to a category) */}
          {!lockedCategory && (
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              <option value="">All Categories</option>
              {categoriesInRows.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {/* New Today — cases whose first-seen date is today. Pure filter-state plumbing:
              fromDate/toDate already filter on first_date, not run_date. */}
          <button
            onClick={toggleNewToday}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              newTodayOnly
                ? "border-primary/60 bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            title="Show only cases first seen today"
          >
            <Zap className="h-3 w-3" />
            New Today
          </button>

          {/* Date range filter */}
          <DateRangePicker
            fromDate={filterFromDate}
            toDate={filterToDate}
            onFromChange={setFilterFromDate}
            onToChange={setFilterToDate}
            disabled={newTodayOnly}
            disabledReason="Pinned to today by the New Today filter"
          />

          {/* Clear filters */}
          {(filterDbType || filterStatus || filterMsorId || (filterCategory && !lockedCategory) || filterFromDate || filterToDate) && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              onClick={() => loadRows()}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={() => handleSave()}
              disabled={!hasUnsavedChanges || saving}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                hasUnsavedChanges && !saving ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-50",
              )}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="px-8 pb-8 flex-1 min-h-0">
        <div className="flex flex-col h-full rounded-md border overflow-hidden">
          {(() => {
            if (loading) return (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
            );
            if (displayedRows.length === 0) return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Layers className="h-10 w-10 opacity-20" />
              <p className="text-sm font-medium">{newTodayOnly ? "No new cases today" : "No cases found"}</p>
              {newTodayOnly ? (
                <p className="text-xs max-w-sm text-center">
                  A case keeps its original first-seen date when it recurs, so a case
                  detected again today is not counted as new.
                </p>
              ) : (
                <p className="text-xs">Try adjusting the filters above</p>
              )}
            </div>
            );
            return (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between gap-3 px-2 py-1.5 border-b shrink-0 flex-wrap">
                <span className="text-xs text-muted-foreground">{displayedRows.length} row{displayedRows.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-3">
                  <ColumnPicker
                    columns={hideableCols}
                    overrides={overrides}
                    autoHidden={autoHidden}
                    onSetVisible={setVisible}
                    onSetAll={setAll}
                    onReset={reset}
                  />
                  <EmptyColumnsToggle count={emptyDataColumns.length} hidden={hideEmptyCols} onToggle={() => setHideEmptyCols((h) => !h)} />
                  <ExcelExportButton
                    gridApi={() => gridRef.current?.api}
                    fileName={lockedCategory ? `All Cases - ${lockedCategory}` : "All Cases"}
                    sheetName={lockedCategory ?? "All Cases"}
                  />
                  <button
                    onClick={() => gridRef.current?.api?.collapseAll()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <ChevronsUpDown className="h-3 w-3" />
                    Collapse All
                  </button>
                </div>
              </div>
              {acSelectedCount > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5 border-b shrink-0 bg-primary/5 flex-wrap">
                  <span className="text-xs font-medium text-primary shrink-0">{acSelectedCount} selected</span>
                  <select
                    value=""
                    onChange={(e) => { const v = e.target.value as RowStatus | ""; if (v) stageAcBulk({ status: v }); }}
                    className="rounded border border-input bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="">Change status…</option>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    type="text"
                    value={acBulkComment}
                    onChange={(e) => setAcBulkComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyAcBulkComment(); } }}
                    placeholder="Comment all + Enter"
                    className="rounded border border-input bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring w-44"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">Posts to each selected case</span>
                  <button
                    onClick={() => { gridRef.current?.api?.deselectAll(); setAcSelectedCount(0); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Deselect
                  </button>
                </div>
              )}
              <div className="ag-theme-datagrip flex-1" style={{ width: "100%", height: "100%" }}>
                <AgGridReact
                  ref={gridRef}
                  theme="legacy"
                  rowData={displayedRows}
                  columnDefs={colDefs}
                  rowHeight={24}
                  headerHeight={26}
                  rowSelection="multiple"
                  suppressMovableColumns
                  suppressCellFocus
                  getRowId={(params) => String((params.data as AllCasesRow).rowId)}
                  onSelectionChanged={handleAcSelectionChanged}
                  onGridReady={(e: GridReadyEvent) => { setGridReady(true); e.api.sizeColumnsToFit(); }}
                />
              </div>
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Category page ─────────────────────────────────────────────────────────────
// Homepage-style layout (header + two pies) scoped to one category, with the
// All Cases table (locked to the category) below.

type PieSlice = { name: string; value: number; color: string; msorId?: number };

type CategoryStat = {
  category: string;
  byItem: PieSlice[];
  byStatus: PieSlice[];
  byAge: CaseAgeData;
  totalCases: number;
};

// Recharts hands click handlers the rendered sector, with the original datum
// nested under `payload`; dig it out so callers see the slice they provided.
function sliceOf(entry: unknown): PieSlice {
  const sector = entry as { payload?: PieSlice } & PieSlice;
  return sector.payload ?? sector;
}

function CategoryPieCard({
  title, subtitleIcon, data, emptyText, subtitle, onSliceClick,
}: Readonly<{
  title: string;
  subtitleIcon: React.ReactNode;
  data: PieSlice[];
  emptyText: string;
  subtitle: string;
  /** When set, slices become click targets (e.g. drill into the slice's category or item). */
  onSliceClick?: (slice: PieSlice) => void;
}>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {subtitleIcon}
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                label={renderSliceValueLabel} labelLine={false}
                cursor={onSliceClick ? "pointer" : undefined}
                onClick={onSliceClick ? (entry) => onSliceClick(sliceOf(entry)) : undefined}
              >
                {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip content={renderCaseTooltip} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// Cases by first-seen date. Mirrors CategoryPieCard's shape, but carries its own
// subtitle (which must surface the excluded-case count) and an explanatory popover.
function CaseAgePieCard({
  data, height = 220, outerRadius = 80, loading = false, emptyText = "No cases to age",
}: Readonly<{
  data: CaseAgeData;
  height?: number;
  outerRadius?: number;
  loading?: boolean;
  emptyText?: string;
}>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Case Age</CardTitle>
              <InfoPopover text={CASE_AGE_DESCRIPTION} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? "Loading…" : caseAgeSubtitle(data)}
            </p>
          </div>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {(() => {
          if (loading) return (
            <div className="flex items-center justify-center" style={{ height }}>
              <Skeleton className="h-24 w-24 rounded-full" />
            </div>
          );
          if (data.slices.length === 0) return (
            <div className="flex items-center justify-center px-4 text-center text-sm text-muted-foreground" style={{ height }}>
              {(() => {
                if (data.unknown > 0) return "First-seen dates unavailable";
                if (data.excluded > 0) return "No cases with a configured identity";
                return emptyText;
              })()}
            </div>
          );
          return (
            <ResponsiveContainer width="100%" height={height}>
              <PieChart>
                <Pie data={data.slices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={outerRadius} label={renderSliceValueLabel} labelLine={false}>
                  {data.slices.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip content={renderCaseTooltip} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }} />
              </PieChart>
            </ResponsiveContainer>
          );
        })()}
      </CardContent>
    </Card>
  );
}

// ── Vertical resizable split ──────────────────────────────────────────────────
// A fixed (always-visible) header, then two stacked panes — top = charts, bottom
// = table — separated by a draggable divider. Dragging grows one pane and shrinks
// the other; the charts pane can collapse all the way to nothing without hiding
// the header. The top pane height is remembered per `storageKey`.

const SPLIT_DIVIDER_HEIGHT = 11;

function VerticalResizable({
  header,
  top,
  bottom,
  storageKey,
  defaultTopHeight = 320,
  minTop = 0,
  minBottom = 0,
}: Readonly<{
  header?: React.ReactNode;
  top: React.ReactNode;
  bottom: React.ReactNode;
  storageKey: string;
  defaultTopHeight?: number;
  minTop?: number;
  minBottom?: number;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topPaneRef = useRef<HTMLDivElement>(null);
  const [topHeight, setTopHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // Guard the null case: Number(null) is 0, which would silently collapse the pane.
      if (saved !== null) { const s = Number(saved); if (Number.isFinite(s) && s >= 0) return s; }
    } catch { /* */ }
    return defaultTopHeight;
  });
  const topHeightRef = useRef(topHeight);
  useEffect(() => { topHeightRef.current = topHeight; }, [topHeight]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(topHeight)); } catch { /* */ }
  }, [storageKey, topHeight]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = topHeightRef.current;
    const onMove = (ev: MouseEvent) => {
      const container = containerRef.current;
      const topPane = topPaneRef.current;
      if (!container || !topPane) return;
      // Space the charts pane may occupy below the fixed header, keeping minBottom
      // for the table and room for the divider.
      const available = container.getBoundingClientRect().bottom - topPane.getBoundingClientRect().top - SPLIT_DIVIDER_HEIGHT - minBottom;
      const next = Math.min(Math.max(startH + (ev.clientY - startY), minTop), Math.max(minTop, available));
      setTopHeight(next);
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [minTop, minBottom]);

  return (
    <div ref={containerRef} className="flex-1 min-h-0 flex flex-col">
      {header && <div className="shrink-0">{header}</div>}
      <div ref={topPaneRef} style={{ height: topHeight }} className="shrink-0 overflow-y-auto">
        {top}
      </div>
      <div
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize"
        className="group relative shrink-0 cursor-row-resize"
        style={{ height: SPLIT_DIVIDER_HEIGHT }}
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border group-hover:bg-primary/40 transition-colors" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-10 rounded-full bg-muted-foreground/30 group-hover:bg-primary/60 transition-colors" />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {bottom}
      </div>
    </div>
  );
}

function CategoryView({
  category, stat, itemCount, queries, queryColorMap, loadingCaseRows, onSelectQuery, onSelectCategory, onBack,
}: Readonly<{
  category: string;
  stat: CategoryStat | undefined;
  itemCount: number;
  queries: MonitoringQuery[];
  queryColorMap: Record<number, string>;
  loadingCaseRows: boolean;
  onSelectQuery: (q: MonitoringQuery) => void;
  onSelectCategory: (cat: string) => void;
  onBack: () => void;
}>) {
  const byItem = stat?.byItem ?? [];
  const byStatus = stat?.byStatus ?? [];
  const byAge = stat?.byAge ?? EMPTY_CASE_AGE;
  const total = stat?.totalCases ?? 0;
  const catDesc = categoryDescription(category);

  // A by-item slice carries its item's msorId; clicking it opens that item's page.
  const openItemSlice = (slice: PieSlice) => {
    const q = queries.find((it) => it.msorId === slice.msorId);
    if (q) onSelectQuery(q);
  };

  return (
    <VerticalResizable
      storageKey="split:category:v3"
      defaultTopHeight={372}
      header={
        <div className="px-8 pt-8 pb-4">
          <button onClick={onBack} className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronRight className="h-3 w-3 rotate-180" /> Home
          </button>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: categoryColor(category) }} />
              {category}
            </h1>
            {catDesc && <InfoPopover text={catDesc} />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {itemCount} monitoring item{itemCount !== 1 ? "s" : ""}
            {total > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {total} total case{total !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
      }
      top={
        <div className="px-8 pt-4 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CategoryPieCard
              title="Cases by Item"
              subtitleIcon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              data={byItem}
              emptyText="No open cases in this category"
              subtitle={byItem.length > 0 ? `${total} case${pluralS(total)} across ${byItem.length} item${pluralS(byItem.length)}` : "No open cases"}
              onSliceClick={openItemSlice}
            />
            <CategoryPieCard
              title="Case Status"
              subtitleIcon={<Activity className="h-4 w-4 text-muted-foreground" />}
              data={byStatus}
              emptyText="No cases in this category"
              subtitle={byStatus.length > 0 ? `${byStatus.reduce((s, d) => s + d.value, 0)} case${pluralS(byStatus.reduce((s, d) => s + d.value, 0))} by status` : "No cases"}
            />
            <CaseAgePieCard data={byAge} loading={loadingCaseRows} emptyText="No cases in this category" />
          </div>
        </div>
      }
      bottom={
        <AllCasesPage
          key={category}
          embedded
          lockedCategory={category}
          queries={queries}
          queryColorMap={queryColorMap}
          onSelectQuery={onSelectQuery}
          onSelectCategory={onSelectCategory}
        />
      }
    />
  );
}

// ── KPI: per-person case workload ─────────────────────────────────────────────
// There is no assignee in the schema. A person is "on" a case if they touched it —
// commented, or changed its status — during the selected month. See
// docs/PLAN_kpi_performance.md for why, and for the consequences that follow.

const KPI_DESCRIPTION =
  "Who worked which cases this month. There is no assignee field, so a person is credited with a case "
  + "when they comment on it or change its status. A case two people touched appears under both, so the "
  + "cards deliberately overlap — never add them up. The month scopes the touch, not the case: a case you "
  + "worked in June and have not touched this month moves to Unattended.";

/** Reserved `?person=` values for the two non-person cards. Real values are emails, which contain `@`. */
const BUCKET_UNATTENDED = "unattended";
const BUCKET_UNATTRIBUTED = "unattributed";

type StatusCounts = Record<RowStatus, number>;

const ZERO_COUNTS: StatusCounts = { OPEN: 0, IN_PROGRESS: 0, DONE: 0 };

const activeOf = (c: StatusCounts) => c.OPEN + c.IN_PROGRESS;
const totalOf = (c: StatusCounts) => c.OPEN + c.IN_PROGRESS + c.DONE;

/**
 * Counts the current status of each referenced case, and returns the keys that actually
 * resolved to one.
 *
 * A ref matching no row is **orphaned**, not zero: it points at a case key that no longer
 * exists, which happens when an item's `identity_columns` change without the activity
 * timeline being re-pointed.
 *
 * `keys` therefore excludes orphans, and every caller must use it rather than the raw refs.
 * Counting a case that does not exist would inflate the header stat and break the identity
 * `touched + unattributed + unattended + dormant = total cases` by exactly the orphan count —
 * an off-by-a-few that looks like a rounding bug and is not one.
 */
function countStatuses(refs: CaseRef[], statusByKey: Map<string, RowStatus>): { counts: StatusCounts; orphaned: number; keys: Set<string> } {
  const counts: StatusCounts = { ...ZERO_COUNTS };
  const keys = new Set<string>();
  let orphaned = 0;
  for (const ref of refs) {
    const key = caseRefKey(ref);
    const status = statusByKey.get(key);
    if (!status) { orphaned++; continue; }
    counts[status]++;
    keys.add(key);
  }
  return { counts, orphaned, keys };
}

/** Status wedges, empty ones dropped. Same shape and colors as the Home and Category pies. */
function statusPieData(counts: StatusCounts) {
  return [
    { name: "Open", value: counts.OPEN, color: ROW_STATUS_COLORS.OPEN },
    { name: "In Progress", value: counts.IN_PROGRESS, color: ROW_STATUS_COLORS.IN_PROGRESS },
    { name: "Done", value: counts.DONE, color: ROW_STATUS_COLORS.DONE },
  ].filter((d) => d.value > 0);
}

type PersonCard = {
  email: string;
  name: string | null;
  isYou: boolean;
  counts: StatusCounts;
  orphaned: number;
  keys: Set<string>;
};

type KpiData = {
  people: PersonCard[];
  /** Cases nobody touched this month and that are not yet DONE — the stale backlog. */
  unattended: { counts: StatusCounts; keys: Set<string> };
  /** Touched this month, but only by authorless entries. */
  unattributed: { counts: StatusCounts; keys: Set<string>; orphaned: number };
  /** Finished earlier, untouched this month. Counted so the arithmetic closes; never drawn. */
  dormant: number;
  /** Distinct cases touched by a person — NOT the sum of the cards. */
  touchedTotal: number;
  orphaned: number;
};

/**
 * Everything the KPI tab draws, derived from the workload response plus the case rows the
 * dashboard already holds. The rows stay the single source of truth for status, so a pie can
 * never disagree with the grid it drills into.
 */
function buildKpiData(workload: CaseWorkloadResponse, caseRows: AllCasesRow[]): KpiData {
  const statusByKey = new Map(caseRows.map((r) => [caseRefKey(r), r.rowStatus]));

  const people: PersonCard[] = workload.people.map((p) => {
    const { counts, orphaned, keys } = countStatuses(p.cases, statusByKey);
    // `keys` (not `p.cases`) is what the drill-down locks to, so the grid's row count is the
    // pie's total by construction.
    return { email: p.authorEmail, name: p.authorName, isYou: p.isYou, counts, orphaned, keys };
  });

  // Yourself first — people look for their own card. Then the busiest. The email tiebreak is
  // not pedantry: without it, equal-count cards reshuffle on every refetch and read as a bug.
  people.sort((a, b) =>
    Number(b.isYou) - Number(a.isYou)
    || activeOf(b.counts) - activeOf(a.counts)
    || totalOf(b.counts) - totalOf(a.counts)
    || a.email.localeCompare(b.email));

  const unattributed = countStatuses(workload.unattributed, statusByKey);

  // A case belongs to the person who touched it; only what nobody claimed is left over.
  // Orphans are already gone from every `keys` set, so `claimed` counts real cases only.
  const claimed = new Set<string>();
  for (const p of people) for (const k of p.keys) claimed.add(k);

  const untouched = caseRows.filter((r) => !claimed.has(caseRefKey(r)) && !unattributed.keys.has(caseRefKey(r)));

  // DONE cases nobody touched this month are dormant, not neglected. Drawing them would
  // rebuild the all-time green disc that monthly scoping exists to prevent.
  const stale = untouched.filter((r) => r.rowStatus !== "DONE");
  const unattendedCounts: StatusCounts = { ...ZERO_COUNTS };
  for (const r of stale) unattendedCounts[r.rowStatus]++;

  return {
    people,
    unattended: { counts: unattendedCounts, keys: new Set(stale.map(caseRefKey)) },
    unattributed,
    dormant: untouched.length - stale.length,
    touchedTotal: claimed.size,
    orphaned: people.reduce((n, p) => n + p.orphaned, 0) + unattributed.orphaned,
  };
}

/** `‹ July 2026 ›`. Clamped to `[earliestMonth, current]` — there is no future work, and nothing before the floor. */
function MonthSelector({
  month, earliestMonth, onChange,
}: Readonly<{ month: string; earliestMonth: string | null; onChange: (m: string) => void }>) {
  const current = nyMonth();
  const atFloor = earliestMonth !== null && month <= earliestMonth;
  const atCurrent = month >= current;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        disabled={atFloor}
        title={atFloor ? "Nothing was tracked before this month" : "Previous month"}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[9.5rem] text-center text-sm font-medium tabular-nums">{monthLabel(month)}</span>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={atCurrent}
        title={atCurrent ? "The month is not over yet" : "Next month"}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {!atCurrent && (
        <button onClick={() => onChange(current)} className="ml-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer">
          This month
        </button>
      )}
    </div>
  );
}

/** Shared click/keyboard affordance. Not a `<button>`: recharts renders interactive tooltip content inside. */
function ClickableCard({
  onOpen, ariaLabel, className, children,
}: Readonly<{ onOpen: () => void; ariaLabel: string; className?: string; children: React.ReactNode }>) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={cn("cursor-pointer rounded-xl outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring hover:shadow-md", className)}
    >
      {children}
    </div>
  );
}

/**
 * One person's month. The **active count is the headline**, not the pie: "how many are they
 * working on" is a number, and the pie only shows how it splits.
 *
 * The `aria-label` carries every number, because a pie says nothing to a screen reader — and
 * because this palette's amber and emerald sit below 3:1 against the light surface, which
 * obliges a non-color reading of the same data.
 */
function PersonPieCard({ card, onOpen }: Readonly<{ card: PersonCard; onOpen: () => void }>) {
  const display = card.name ?? card.email;
  const data = statusPieData(card.counts);
  const active = activeOf(card.counts);
  const total = totalOf(card.counts);
  const label = `${display} — ${active} active of ${total} case${pluralS(total)}: `
    + `${card.counts.OPEN} open, ${card.counts.IN_PROGRESS} in progress, ${card.counts.DONE} done. Open their cases.`;

  return (
    <ClickableCard onOpen={onOpen} ariaLabel={label}>
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.65rem] font-semibold uppercase text-primary">
                  {display.charAt(0)}
                </span>
                <CardTitle className="truncate">{display}</CardTitle>
                {card.isYou && <Badge variant="secondary" className="shrink-0 text-[0.65rem]">You</Badge>}
              </div>
              {/* The name can be null and the email long; show the email only when it is not already the title. */}
              {card.name && <p className="mt-1 truncate text-xs text-muted-foreground" title={card.email}>{card.email}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold leading-none tabular-nums">{active}</p>
              <p className="mt-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">Active</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No cases</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={renderSliceValueLabel} labelLine={false}>
                  {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip content={renderCaseTooltip} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {total} case{pluralS(total)} touched
            {card.orphaned > 0 && <span title="These cases no longer exist — an item's identity columns changed."> · {card.orphaned} orphaned</span>}
          </p>
        </CardContent>
      </Card>
    </ClickableCard>
  );
}

/**
 * The two non-person cards are **stat tiles, not pies**.
 *
 * Unattended has at most two wedges once DONE is excluded, and a two-slice pie is a number
 * wearing a costume. A tile also separates "not a person" from "a person" structurally,
 * which is honest — where grey-ing the pie would not be, since OPEN is already grey.
 */
function WorkloadStatTile({
  title, hint, icon, value, unit, segments, footer, onOpen,
}: Readonly<{
  title: string;
  hint: string;
  icon: React.ReactNode;
  value: number;
  unit: string;
  segments: { name: string; value: number; color: string }[];
  footer?: string;
  onOpen: () => void;
}>) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const label = `${title} — ${value} ${unit}. `
    + segments.map((s) => `${s.value} ${s.name.toLowerCase()}`).join(", ") + ". Open these cases.";

  return (
    <ClickableCard onOpen={onOpen} ariaLabel={label}>
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-muted-foreground">{title}</CardTitle>
              <InfoPopover text={hint} />
            </div>
            {icon}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1.5 text-sm text-muted-foreground">{unit}</p>

          {/* A thin bar, 2px surface gaps between segments, rounded ends. Direct-labelled below,
              so identity never rests on color alone. */}
          {total > 0 && (
            <>
              <div className="mt-5 flex h-2 w-full gap-[2px] overflow-hidden">
                {segments.filter((s) => s.value > 0).map((s) => (
                  <div key={s.name} className="h-full rounded-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                {segments.filter((s) => s.value > 0).map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: s.color }} />
                    {s.name}
                    <span className="font-medium tabular-nums text-foreground">{s.value}</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {footer && <p className="mt-3 text-xs text-muted-foreground">{footer}</p>}
        </CardContent>
      </Card>
    </ClickableCard>
  );
}

function KpiView({
  month, data, earliestMonth, loading, error, totalCases, onChangeMonth, onOpenPerson, onOpenBucket, onRetry,
}: Readonly<{
  month: string;
  data: KpiData | null;
  earliestMonth: string | null;
  loading: boolean;
  error: string | null;
  /** Every known case, the denominator the four buckets reconcile against. */
  totalCases: number;
  onChangeMonth: (m: string) => void;
  onOpenPerson: (email: string) => void;
  onOpenBucket: (bucket: string) => void;
  onRetry: () => void;
}>) {
  const earliest = earliestMonth;
  const belowFloor = earliest !== null && month < earliest;

  const header = (
    <div className="px-8 pt-8 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Team Workload</h1>
          <InfoPopover text={KPI_DESCRIPTION} />
        </div>
        <MonthSelector month={month} earliestMonth={earliest} onChange={onChangeMonth} />
      </div>
      {data && !belowFloor && (
        <p className="mt-1 text-sm text-muted-foreground">
          {/* The DISTINCT union, never the sum of the cards — two people can touch one case. */}
          {data.touchedTotal} case{pluralS(data.touchedTotal)} touched by {data.people.length} {data.people.length === 1 ? "person" : "people"}
          {activeOf(data.unattended.counts) > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {activeOf(data.unattended.counts)} unattended
            </span>
          )}
          {data.dormant > 0 && (
            <span className="ml-2 text-xs" title="Resolved earlier and untouched this month. Counted so the numbers reconcile with the total case count; not drawn.">
              · {data.dormant} dormant of {totalCases} total
            </span>
          )}
        </p>
      )}
    </div>
  );

  const body = (() => {
    if (error) return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="mb-3 h-8 w-8 text-destructive opacity-60" />
        <p className="text-sm font-medium">Could not load the workload</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">{error}</p>
        <button onClick={onRetry} className="mt-4 rounded-md border px-3 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer">Try again</button>
      </div>
    );

    if (loading || !data) return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[340px] w-full rounded-xl" />)}
      </div>
    );

    // Not "nobody did anything" — nothing was ever recorded. Saying zero would be a lie.
    if (belowFloor) return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground opacity-30" />
        <p className="text-sm font-medium">Not tracked before {monthLabel(earliest!)}</p>
        <p className="mt-1 text-xs text-muted-foreground">The activity timeline does not go back this far.</p>
      </div>
    );

    const hasUnattributed = totalOf(data.unattributed.counts) > 0;

    return (
      <>
        {data.people.length === 0 && (
          // The 1st of a month looks exactly like this, and it is not a failed fetch.
          <div className="mb-4 rounded-lg border border-dashed px-4 py-6 text-center">
            <p className="text-sm font-medium">No activity yet in {monthLabel(month)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Cards appear as people comment on cases or change their status.</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.people.map((card) => (
            <PersonPieCard key={card.email} card={card} onOpen={() => onOpenPerson(card.email)} />
          ))}

          <WorkloadStatTile
            title="Unattended"
            hint="Open cases that nobody commented on or moved this month. Cases already resolved are not counted here — they are dormant, not neglected."
            icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            value={activeOf(data.unattended.counts)}
            unit={`unresolved case${pluralS(activeOf(data.unattended.counts))} nobody touched in ${monthLabel(month)}`}
            segments={statusPieData(data.unattended.counts).filter((s) => s.name !== "Done")}
            onOpen={() => onOpenBucket(BUCKET_UNATTENDED)}
          />

          {hasUnattributed && (
            <WorkloadStatTile
              title="Unattributed"
              hint="Cases touched this month by entries that carry no author — comments imported before the activity timeline existed, and anything written while authentication is disabled. The identity was never recorded, so these can never be credited to anyone."
              icon={<Info className="h-4 w-4 text-muted-foreground" />}
              value={totalOf(data.unattributed.counts)}
              unit={`case${pluralS(totalOf(data.unattributed.counts))} touched by an unknown author`}
              segments={statusPieData(data.unattributed.counts)}
              footer="Commented before the activity timeline existed, or while auth was disabled."
              onOpen={() => onOpenBucket(BUCKET_UNATTRIBUTED)}
            />
          )}
        </div>

        {data.orphaned > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            {data.orphaned} activity {data.orphaned === 1 ? "entry references a case" : "entries reference cases"} that no longer exist and {data.orphaned === 1 ? "is" : "are"} excluded.
            This happens when an item&rsquo;s identity columns change without the timeline being re-pointed.
          </p>
        )}
      </>
    );
  })();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0">{header}</div>
      <div className="flex-1 overflow-y-auto px-8 pb-8">{body}</div>
    </div>
  );
}

// ── Person page ───────────────────────────────────────────────────────────────
// CategoryView, with a person's month substituted for the category. Deliberately the same
// shape: it is "the Home page scoped to a subset", which is exactly what a drill-down is.

function PersonView({
  title, subtitle, caseKeys, month, caseRows, firstSeenByKey, loadingCaseRows,
  queries, queryColorMap, onSelectQuery, onSelectCategory, onBack, onRowsSaved,
}: Readonly<{
  title: string;
  subtitle: string;
  caseKeys: Set<string>;
  month: string;
  caseRows: AllCasesRow[];
  firstSeenByKey: Map<string, string>;
  loadingCaseRows: boolean;
  queries: MonitoringQuery[];
  queryColorMap: Record<number, string>;
  onSelectQuery: (q: MonitoringQuery) => void;
  onSelectCategory: (cat: string) => void;
  onBack: () => void;
  onRowsSaved: () => void;
}>) {
  const rows = useMemo(() => caseRows.filter((r) => caseKeys.has(caseRefKey(r))), [caseRows, caseKeys]);

  const byStatus = useMemo(() => {
    const counts: StatusCounts = { ...ZERO_COUNTS };
    for (const r of rows) counts[r.rowStatus]++;
    return counts;
  }, [rows]);

  const byItem = useMemo(() => {
    const byMsor = new Map<number, number>();
    for (const r of rows) byMsor.set(r.msorId, (byMsor.get(r.msorId) ?? 0) + 1);
    return [...byMsor.entries()]
      .map(([msorId, value]) => ({
        name: queries.find((q) => q.msorId === msorId)?.title ?? `Item ${msorId}`,
        value,
        color: queryColorMap[msorId] ?? QUERY_COLORS[0],
        msorId,
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [rows, queries, queryColorMap]);

  // Ages by first-seen, not by when it was touched — so a case opened in June and worked in
  // October legitimately reads as months old. The subtitle must not imply month-relative ages.
  const byAge = useMemo(() => buildCaseAgeData(rows, firstSeenByKey, nyToday()), [rows, firstSeenByKey]);

  const active = activeOf(byStatus);
  const total = totalOf(byStatus);

  return (
    <VerticalResizable
      storageKey="split:person:v1"
      defaultTopHeight={372}
      header={
        <div className="px-8 pt-8 pb-4">
          <button onClick={onBack} className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronRight className="h-3 w-3 rotate-180" /> Team Workload
          </button>
          <h1 className="truncate text-xl font-bold">{title}</h1>
          {/* This page is a filtered Home; without the month in words nothing tells you so. */}
          <p className="mt-1 text-sm text-muted-foreground">
            {monthLabel(month)} · {subtitle}
            {total > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {active} active of {total} case{pluralS(total)}
              </span>
            )}
          </p>
        </div>
      }
      top={
        <div className="px-8 pt-4 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CategoryPieCard
              title="Cases by Item"
              subtitleIcon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              data={byItem}
              emptyText="No cases"
              subtitle={byItem.length > 0 ? `${total} case${pluralS(total)} across ${byItem.length} item${pluralS(byItem.length)}` : "No cases"}
              onSliceClick={(slice) => {
                const q = queries.find((it) => it.msorId === slice.msorId);
                if (q) onSelectQuery(q);
              }}
            />
            <CategoryPieCard
              title="Case Status"
              subtitleIcon={<Activity className="h-4 w-4 text-muted-foreground" />}
              data={statusPieData(byStatus)}
              emptyText="No cases"
              subtitle={total > 0 ? `${total} case${pluralS(total)} by status` : "No cases"}
            />
            <CaseAgePieCard data={byAge} loading={loadingCaseRows} emptyText="No cases" />
          </div>
        </div>
      }
      bottom={
        <AllCasesPage
          key={`${title}:${month}`}
          embedded
          lockedCaseKeys={caseKeys}
          onRowsSaved={onRowsSaved}
          queries={queries}
          queryColorMap={queryColorMap}
          onSelectQuery={onSelectQuery}
          onSelectCategory={onSelectCategory}
        />
      }
    />
  );
}

// ── Home view ─────────────────────────────────────────────────────────────────

function HomeView({
  queries, loadingQueries, totalCaseCount,
  homePieData, caseStatusPieData, caseStatusTotal, caseAgeData, loadingCaseRows, newToday,
  queryColorMap, onSelectQuery, onSelectCategory,
}: Readonly<{
  queries: MonitoringQuery[];
  loadingQueries: boolean;
  totalCaseCount: number;
  homePieData: { name: string; value: number; color: string }[];
  caseStatusPieData: { name: string; value: number; color: string }[];
  caseStatusTotal: number;
  caseAgeData: CaseAgeData;
  loadingCaseRows: boolean;
  newToday: { count: number; resolved: number };
  queryColorMap: Record<number, string>;
  onSelectQuery: (q: MonitoringQuery) => void;
  onSelectCategory: (cat: string) => void;
}>) {
  return (
    <VerticalResizable
      storageKey="split:home:v3"
      defaultTopHeight={372}
      header={
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Overview</h1>
            <InfoPopover text={HOME_DESCRIPTION} />
          </div>
          {!loadingQueries && (
            <p className="mt-1 text-sm text-muted-foreground">
              {queries.length} monitoring item{pluralS(queries.length)}
              {totalCaseCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {totalCaseCount} total case{pluralS(totalCaseCount)}
                </span>
              )}
              {newToday.count > 0 && (
                // Counts new *and unresolved* cases, so it will read lower than the pie's
                // Today wedge whenever something was opened and closed the same day. The
                // title explains the gap rather than leaving it looking like a bug.
                <span
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  title={newToday.resolved > 0
                    ? `${newToday.count} new today · ${newToday.resolved} already resolved`
                    : `${newToday.count} case${pluralS(newToday.count)} first seen today`}
                >
                  {newToday.count} new today
                </span>
              )}
            </p>
          )}
        </div>
      }
      top={
        <div className="px-8 pt-4 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CategoryPieCard
              title="Total Cases — All Items"
              subtitleIcon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              data={homePieData}
              emptyText="No open cases across all items"
              subtitle={homePieData.length > 0 ? `${totalCaseCount} open case${pluralS(totalCaseCount)} across ${homePieData.length} categor${homePieData.length === 1 ? "y" : "ies"}` : "No open cases"}
              onSliceClick={(slice) => onSelectCategory(slice.name)}
            />
            <CategoryPieCard
              title="Case Status — All Items"
              subtitleIcon={<Activity className="h-4 w-4 text-muted-foreground" />}
              data={caseStatusPieData}
              emptyText="No cases across all items"
              subtitle={caseStatusPieData.length > 0 ? `${caseStatusTotal} case${pluralS(caseStatusTotal)} by status` : "No cases"}
            />
            <CaseAgePieCard data={caseAgeData} loading={loadingQueries || loadingCaseRows} emptyText="No cases across all items" />
          </div>
        </div>
      }
      bottom={
        <AllCasesPage
          embedded
          queries={queries}
          queryColorMap={queryColorMap}
          onSelectQuery={onSelectQuery}
          onSelectCategory={onSelectCategory}
        />
      }
    />
  );
}

// ── Query detail view ─────────────────────────────────────────────────────────

function QueryDetailView({
  selectedQuery, selectedResult, allResults, loadingResults, loadingRows,
  effectiveRows, rowStatusPieData, itemCaseAgeData, loadingCaseRows, hasUnsavedChanges, savingRows,
  itemAvailableDates, triggeringId, queryColorMap, scanWindow, runError, firstSeenByKey,
  onGoHome, onDateSelect, onEdit, onOpenHistory, onRun, onScanWindowChange, onDelete, onSaveChanges, onChangeRow, onBulkUpdate,
}: Readonly<{
  selectedQuery: MonitoringQuery;
  selectedResult: MonitoringResult | null;
  allResults: MonitoringResult[];
  loadingResults: boolean;
  loadingRows: boolean;
  effectiveRows: MonitoringResultRow[];
  rowStatusPieData: { name: string; value: number; color: string }[];
  itemCaseAgeData: CaseAgeData;
  loadingCaseRows: boolean;
  hasUnsavedChanges: boolean;
  savingRows: boolean;
  itemAvailableDates: Set<string>;
  triggeringId: number | null;
  queryColorMap: Record<number, string>;
  scanWindow: ScanWindow;
  runError: string | null;
  /** `msorId:caseKey` -> the date the case was first seen. Drives the Age column. */
  firstSeenByKey: Map<string, string>;
  onGoHome: () => void;
  onDateSelect: (result: MonitoringResult) => void;
  onEdit: (q: MonitoringQuery) => void;
  onOpenHistory: () => void;
  onRun: (id: number, window?: ScanWindow) => void;
  onScanWindowChange: (w: ScanWindow) => void;
  onDelete: (q: MonitoringQuery) => void;
  onSaveChanges: () => void;
  onChangeRow: (rowId: number, status: RowStatus, comment: string | null) => Promise<void>;
  onBulkUpdate: (rowIds: number[], changes: BulkRowChange) => Promise<void>;
}>) {
  return (
    <VerticalResizable
      storageKey="split:item:v3"
      defaultTopHeight={312}
      header={
        <div className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <button onClick={onGoHome} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer" title="Back to overview">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: queryColorMap[selectedQuery.msorId] ?? QUERY_COLORS[0] }} />
              <h1 className="text-xl font-bold">{selectedQuery.title}</h1>
              {selectedQuery.description && <InfoPopover text={selectedQuery.description} />}
              {selectedQuery.activeYn === "N" && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {selectedQuery.ownerName && <span>Owner: <span className="text-foreground">{selectedQuery.ownerName}</span></span>}
              {selectedQuery.queryInterval && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{selectedQuery.queryInterval}</span>}
              {selectedQuery.dbType && <Badge variant="outline" className="text-xs">{selectedQuery.dbType}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <MiniCalendar
              value={selectedResult?.runDate ?? ""}
              onChange={(date) => { const match = allResults.find((r) => r.runDate === date); if (match) { onDateSelect(match); } }}
              availableDates={itemAvailableDates}
              restrictToAvailable
              showClear={false}
              placeholder="Select run date"
            />
            <button onClick={() => onEdit(selectedQuery)} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-accent"><Pencil className="h-3.5 w-3.5" />Edit</button>
            <button onClick={onOpenHistory} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-accent"><History className="h-3.5 w-3.5" />History</button>
            {selectedQuery.dateRangeSupported ? (
              <RunScanControl
                window={scanWindow}
                onWindowChange={onScanWindowChange}
                onRun={() => onRun(selectedQuery.msorId, scanWindow)}
                running={triggeringId === selectedQuery.msorId}
              />
            ) : (
              // No window to offer: this item still carries a literal date floor in its SQL
              // and ignores the range parameters entirely.
              <button onClick={() => onRun(selectedQuery.msorId)} disabled={triggeringId === selectedQuery.msorId} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"><Zap className="h-3.5 w-3.5" />{triggeringId === selectedQuery.msorId ? "Running…" : "Run Now"}</button>
            )}
            <button onClick={() => onDelete(selectedQuery)} className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
        </div>
        </div>
      }
      top={
        <div className="px-8 pt-4 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Case Status Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {(() => {
                  if (loadingResults) return "Loading…";
                  if (!selectedResult) return "No data";
                  return (
                    <>
                      {`${selectedResult.resultCount} case${pluralS(selectedResult.resultCount)} on ${formatDate(selectedResult.runDate)}`}
                      <ScanRangeNote result={selectedResult} />
                    </>
                  );
                })()}
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                if (loadingResults) return (
                <div className="flex h-36 items-center justify-center"><Skeleton className="h-24 w-24 rounded-full" /></div>
                );
                if (rowStatusPieData.length === 0) return (
                <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                  {emptyCasesText(selectedResult)}
                </div>
                );
                return (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={rowStatusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={renderSliceValueLabel} labelLine={false}>
                      {rowStatusPieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={renderRowTooltip} />
                    <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: "0.75rem" }} />
                  </PieChart>
                </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>
          {/*
            Replaces the old "Select Date" card. Nothing is lost: the header MiniCalendar
            already drives onDateSelect over the same allResults, with the same
            availableDates highlighting. Per-run FAIL/count status now lives in History.
          */}
          <CaseAgePieCard
            data={itemCaseAgeData}
            height={160}
            outerRadius={60}
            loading={loadingResults || loadingRows || loadingCaseRows}
            emptyText={emptyCasesText(selectedResult)}
          />
        </div>
        </div>
      }
      bottom={
        selectedResult ? (
        <div className="flex flex-col h-full overflow-hidden px-8 pt-2 pb-8 gap-3">
          <div className="shrink-0 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-base">{formatFullDate(selectedResult.runDate)}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <StatusBadge status={selectedResult.resultStatus} />
                <span><span className="font-medium text-foreground">{selectedResult.resultCount}</span> {selectedResult.resultCount === 1 ? "case" : "cases"}</span>
                {selectedResult.suppressedCount > 0 && (
                  <span title="Cases this query still matched, but that were already marked Done. They stay in the history of the runs before you closed them; this run no longer tracks or alerts on them.">
                    {selectedResult.suppressedCount} done, hidden
                  </span>
                )}
                {selectedResult.executionMs != null && <span>{selectedResult.executionMs} ms</span>}
                {selectedResult.triggeredAlertYn === "Y" && <Badge variant="warning">Alert sent</Badge>}
              </div>
            </div>
            <button
              onClick={onSaveChanges}
              disabled={!hasUnsavedChanges || savingRows}
              className={cn("flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors", hasUnsavedChanges && !savingRows ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-50")}
            >
              <Save className="h-3.5 w-3.5" />
              {savingRows ? "Saving…" : "Save Changes"}
            </button>
          </div>

          {runError && (
            <div className="shrink-0 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-destructive">Run not started</p>
                <p className="mt-0.5 text-sm text-destructive/80 break-words">{runError}</p>
              </div>
            </div>
          )}

          {selectedResult.resultStatus === "FAIL" && selectedResult.errorMessage && (
            <ErrorPanel message={selectedResult.errorMessage} detail={selectedResult.errorDetail} pastUnresolved={selectedResult.pastUnresolvedYn === "Y"} />
          )}

          <div className="flex-1 min-h-0 rounded-md border overflow-hidden">
            {loadingRows ? (
              <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <RowsTable
                rows={effectiveRows}
                dbType={selectedQuery.dbType}
                msorId={selectedQuery.msorId}
                firstSeenByKey={firstSeenByKey}
                windowBegin={selectedResult.beginDate}
                onUpdateRow={onChangeRow}
                onBulkUpdate={onBulkUpdate}
                exportFileName={`${selectedQuery.title} - ${selectedResult.runDate}`}
                exportSheetName={selectedQuery.sheetName || selectedQuery.title}
              />
            )}
          </div>
        </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-sm text-muted-foreground">
            {runError && (
              <div className="flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-left">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-destructive">Run not started</p>
                  <p className="mt-0.5 text-sm text-destructive/80 break-words">{runError}</p>
                </div>
              </div>
            )}
            <span>Select a run date to view its cases</span>
          </div>
        )
      }
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [pendingId] = useState<number | null>(() => {
    const p = new URLSearchParams(window.location.search).get("id");
    return p ? Number(p) : null;
  });
  const [view, setView] = useState<"home" | "query" | "category" | "kpi" | "person">(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("person")) return "person";
    if (params.has("kpi")) return "kpi";
    if (params.get("category")) return "category";
    return pendingId !== null ? "query" : "home";
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("category"),
  );

  // The month lives in the URL on both KPI views. Without it, drilling into a person from
  // October and pressing Back would silently land you on the current month — a different
  // dataset than the one you left.
  const [kpiMonth, setKpiMonth] = useState<string>(
    () => new URLSearchParams(window.location.search).get("month") ?? nyMonth(),
  );
  /** An email, or one of the reserved `BUCKET_*` values (which contain no `@`). */
  const [selectedPerson, setSelectedPerson] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("person"),
  );
  const [workload, setWorkload] = useState<CaseWorkloadResponse | null>(null);
  const [loadingWorkload, setLoadingWorkload] = useState(false);
  const [workloadError, setWorkloadError] = useState<string | null>(null);
  const [itemsOpen, setItemsOpen] = useState(true);

  const [queries, setQueries] = useState<MonitoringQuery[]>([]);
  const [loadingQueries, setLoadingQueries] = useState(true);

  const [homeResults, setHomeResults] = useState<Record<number, MonitoringResult[]>>({});
  const [caseRows, setCaseRows] = useState<AllCasesRow[]>([]);
  const [loadingCaseRows, setLoadingCaseRows] = useState(true);

  const [allResults, setAllResults] = useState<MonitoringResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const [selectedResult, setSelectedResult] = useState<MonitoringResult | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);

  const [selectedQuery, setSelectedQuery] = useState<MonitoringQuery | null>(null);
  const [triggeringId, setTriggeringId] = useState<number | null>(null);
  // Held for the session and shared across items, so an operator investigating a date range
  // does not re-enter it for every item they look at. Never persisted: a range that outlived
  // the tab would silently narrow tomorrow's runs.
  const [scanWindow, setScanWindow] = useState<ScanWindow>(defaultScanWindow);
  const [runError, setRunError] = useState<string | null>(null);
  const [editingQueryTarget, setEditingQueryTarget] = useState<MonitoringQuery | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [creatingQuery, setCreatingQuery] = useState(false);
  const [confirmDeleteQuery, setConfirmDeleteQuery] = useState<MonitoringQuery | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [runSelectionOpen, setRunSelectionOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [sectionMenuPos, setSectionMenuPos] = useState({ top: 0, left: 0 });
  const sectionMenuTriggerRef = useRef<HTMLButtonElement>(null);

  // Select mode — checkboxes hidden until enabled
  const [selectMode, setSelectMode] = useState(false);

  // Invite-user modal (admins only)
  const [showUserAdmin, setShowUserAdmin] = useState(false);
  // Only admins may manage users. This used to be `isAuthenticated()`, which showed the control to
  // every signed-in user and let them discover their lack of access via a 403.
  const canManageUsers = isDemoMode() || hasRole("ADMIN");

  const [draftRows, setDraftRows] = useState<Record<number, { rowStatus: RowStatus; rowComment: string | null }>>({});
  const [savingRows, setSavingRows] = useState(false);
  const [latestMap, setLatestMap] = useState<Record<number, MonitoringResult | null>>({});

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem("dark-mode") === "true"; }
    catch { return false; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try { localStorage.setItem("dark-mode", String(darkMode)); }
    catch { /* ignore */ }
  }, [darkMode]);

  const abortRef = useRef<AbortController | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadHomeResults = useCallback(async (queryList: MonitoringQuery[]) => {
    if (queryList.length === 0) return;
    const entries = await Promise.all(
      queryList.map(async (q) => {
        try {
          const page = await fetchResults(q.msorId, { size: 60 });
          const sorted = [...page.content].sort((a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime());
          return [q.msorId, sorted] as const;
        } catch { return [q.msorId, [] as MonitoringResult[]] as const; }
      }),
    );
    setHomeResults(Object.fromEntries(entries));
  }, []);

  // First-seen dates for every case, keyed `${msorId}:${caseKey}`. The rows each page
  // renders carry no date at all, and homeResults holds only a 60-run window — a case
  // whose first sighting predates that window would be dated to the window edge and
  // reported as new. Only the server's MIN(run_date) is trustworthy.
  const loadCaseRows = useCallback(async () => {
    setLoadingCaseRows(true);
    try { setCaseRows(await fetchAllResultRows()); }
    catch (e) { console.error("Failed to load case first-seen dates", e); }
    finally { setLoadingCaseRows(false); }
  }, []);

  const loadWorkload = useCallback(async (month: string) => {
    setLoadingWorkload(true);
    setWorkloadError(null);
    try { setWorkload(await fetchCaseWorkload(month)); }
    catch (e) {
      console.error("Failed to load case workload", e);
      setWorkloadError(e instanceof Error ? e.message : "Unknown error");
      setWorkload(null);
    } finally { setLoadingWorkload(false); }
  }, []);

  // Only the KPI views consume it, and only for the month they are showing.
  useEffect(() => {
    if (view === "kpi" || view === "person") loadWorkload(kpiMonth);
  }, [view, kpiMonth, loadWorkload]);

  /**
   * Refresh after a write. The two halves of a pie come from two places, and only one of them
   * can have changed:
   *
   * - **Statuses** come from `caseRows`, so refreshing those updates every month's wedges,
   *   past ones included (a July case you finish today turns green in July's pie).
   * - **Case membership** comes from the workload call, and a new touch can only ever land in
   *   the *current* month. Viewing a past month, that response cannot have changed — refetching
   *   it would be pure waste.
   */
  const refreshAfterRowWrite = useCallback(() => {
    loadCaseRows();
    if (kpiMonth === nyMonth()) loadWorkload(kpiMonth);
  }, [loadCaseRows, loadWorkload, kpiMonth]);

  const loadQueries = useCallback(async () => {
    setLoadingQueries(true);
    setHomeResults({});
    try {
      const data = await fetchQueries();
      setQueries(data);
      if (pendingId !== null) {
        const match = data.find((q) => q.msorId === pendingId);
        if (match) { setSelectedQuery(match); setView("query"); window.history.replaceState({ queryId: match.msorId }, "", `?id=${match.msorId}`); }
        else { setView("home"); window.history.replaceState({}, "", import.meta.env.BASE_URL); }
      }
      const latestEntries = await Promise.all(
        data.map(async (q) => {
          try { const page = await fetchResults(q.msorId, { size: 1 }); return [q.msorId, page.content[0] ?? null] as const; }
          catch { return [q.msorId, null] as const; }
        }),
      );
      setLatestMap(Object.fromEntries(latestEntries));
      loadHomeResults(data);
      loadCaseRows();
    } catch (e) { console.error("Failed to load queries", e); }
    finally { setLoadingQueries(false); }
  }, [loadHomeResults, loadCaseRows, pendingId]);

  useEffect(() => { loadQueries(); }, [loadQueries]);

  useEffect(() => {
    if (!selectedQuery) { setAllResults([]); setSelectedResult(null); return; }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoadingResults(true);
    setAllResults([]);
    setSelectedResult(null);
    fetchResults(selectedQuery.msorId, { size: 60 })
      .then((page) => {
        const sorted = [...page.content].sort((a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime());
        setAllResults(sorted);
        if (sorted.length > 0) setSelectedResult(sorted[sorted.length - 1]);
      })
      .catch((e) => { if ((e as Error).name !== "AbortError") console.error(e); })
      .finally(() => setLoadingResults(false));
  }, [selectedQuery]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDateSelect = useCallback(async (result: MonitoringResult) => {
    if (!selectedQuery) return;
    if (result.rows?.length > 0 || result.resultCount === 0) { setSelectedResult(result); return; }
    setLoadingRows(true);
    setSelectedResult(result);
    try {
      const page = await fetchResults(selectedQuery.msorId, { date: result.runDate, size: 1 });
      if (page.content.length > 0) setSelectedResult(page.content[0]);
    } catch (e) { console.error("Failed to load rows", e); }
    finally { setLoadingRows(false); }
  }, [selectedQuery]);

  useEffect(() => { setDraftRows({}); }, [selectedResult?.resultId]);

  const handleChangeRow = useCallback(async (rowId: number, status: RowStatus, comment: string | null) => {
    setDraftRows((prev) => {
      const original = selectedResult?.rows.find((r) => r.rowId === rowId);
      if (!original) return prev;
      if (status === original.rowStatus && comment === original.rowComment) { const { [rowId]: _, ...rest } = prev; return rest; }
      return { ...prev, [rowId]: { rowStatus: status, rowComment: comment } };
    });
  }, [selectedResult]);

  const handleSaveChanges = useCallback(async () => {
    if (Object.keys(draftRows).length === 0) return;
    setSavingRows(true);
    try {
      await Promise.all(Object.entries(draftRows).map(([rowIdStr, change]) => updateRow(Number(rowIdStr), change.rowStatus, change.rowComment)));
      const snapshot = draftRows;
      const patchRows = (rows: MonitoringResultRow[]) => rows.map((r) => (snapshot[r.rowId] ? { ...r, ...snapshot[r.rowId] } : r));
      setSelectedResult((prev) => (prev ? { ...prev, rows: patchRows(prev.rows) } : prev));
      setAllResults((prev) => prev.map((r) => ({ ...r, rows: patchRows(r.rows ?? []) })));
      setDraftRows({});
    } finally { setSavingRows(false); }
  }, [draftRows]);

  // Bulk update for the detail table: stage status and/or comment for many rows
  // into the same draft buffer as inline edits, so the single "Save Changes"
  // button commits everything together. For fields the bulk action leaves
  // untouched, the row keeps its current value — including any unsaved staged
  // draft. A staged change that matches the original row drops the draft.
  const handleBulkUpdateRows = useCallback(async (rowIds: number[], changes: BulkRowChange) => {
    if (rowIds.length === 0) return;
    setDraftRows((prev) => {
      const byId = new Map((selectedResult?.rows ?? []).map((r) => [r.rowId, r]));
      const next = { ...prev };
      for (const id of rowIds) {
        const row = byId.get(id);
        if (!row) continue;
        const current = next[id];
        const status = changes.status ?? current?.rowStatus ?? row.rowStatus;
        const comment = "comment" in changes ? (changes.comment ?? null) : (current?.rowComment ?? row.rowComment);
        if (status === row.rowStatus && comment === row.rowComment) delete next[id];
        else next[id] = { rowStatus: status, rowComment: comment };
      }
      return next;
    });
  }, [selectedResult]);

  const refreshQueryData = useCallback(async (msorId: number) => {
    try {
      // A fresh run can mint new cases, so the first-seen lookup goes stale with the rows.
      loadCaseRows();
      const [latestPage, allPage] = await Promise.all([fetchResults(msorId, { size: 1 }), fetchResults(msorId, { size: 60 })]);
      setLatestMap((prev) => ({ ...prev, [msorId]: latestPage.content[0] ?? null }));
      const sorted = [...allPage.content].sort((a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime());
      setHomeResults((prev) => ({ ...prev, [msorId]: sorted }));
      setSelectedQuery((currentQuery) => {
        if (currentQuery?.msorId === msorId) {
          setAllResults(sorted);
          setSelectedResult((currentResult) => {
            const refreshed = sorted.find((r) => r.resultId === currentResult?.resultId);
            return refreshed ?? (sorted.length > 0 ? sorted[sorted.length - 1] : currentResult);
          });
        }
        return currentQuery;
      });
    } catch (e) { console.error("Failed to refresh query data", e); }
  }, [loadCaseRows]);

  /**
   * Runs one item. `window` is sent only for items that honour it — an item still carrying a
   * literal date floor would ignore the parameters, and sending them would record a range on
   * the result that the query never actually applied.
   */
  const handleRun = async (msorId: number, window?: ScanWindow) => {
    setTriggeringId(msorId);
    setRunError(null);
    try {
      await triggerRun(msorId, window);
      setTimeout(() => refreshQueryData(msorId), 3000);
    } catch (e) {
      // The request is rejected before the run starts (a bad range is a 400), so there is no
      // result row to carry the message — without this the click would look like it worked.
      setRunError(e instanceof Error ? e.message : "Failed to start the run");
    } finally {
      setTriggeringId(null);
    }
  };

  const handleDelete = useCallback(async (query: MonitoringQuery) => {
    setDeletingInProgress(true);
    try {
      await deleteQuery(query.msorId);
      setQueries((qs) => qs.filter((q) => q.msorId !== query.msorId));
      setConfirmDeleteQuery(null);
      if (selectedQuery?.msorId === query.msorId) { setView("home"); window.history.pushState({}, "", import.meta.env.BASE_URL); }
    } finally { setDeletingInProgress(false); }
  }, [selectedQuery]);

  const toggleCheck = useCallback((id: number) => {
    setCheckedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  // Toggle every item in a category at once. If all are already checked, clear
  // them; otherwise select the whole group.
  const toggleCategoryCheck = useCallback((ids: number[]) => {
    setCheckedIds((prev) => {
      const allChecked = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allChecked) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const handleToggleOnHold = useCallback(async (q: MonitoringQuery) => {
    const next = q.onHoldYn === "Y" ? "N" : "Y";
    // Optimistic update; revert on failure.
    setQueries((qs) => qs.map((x) => (x.msorId === q.msorId ? { ...x, onHoldYn: next } : x)));
    if (selectedQuery?.msorId === q.msorId) setSelectedQuery((s) => (s ? { ...s, onHoldYn: next } : s));
    try {
      await setOnHold(q.msorId, next === "Y");
    } catch {
      setQueries((qs) => qs.map((x) => (x.msorId === q.msorId ? { ...x, onHoldYn: q.onHoldYn } : x)));
      if (selectedQuery?.msorId === q.msorId) setSelectedQuery((s) => (s ? { ...s, onHoldYn: q.onHoldYn } : s));
    }
  }, [selectedQuery]);

  const handleRunSelected = useCallback(async (ids: number[]) => {
    await Promise.allSettled(ids.map((id) => triggerRun(id)));
    setCheckedIds(new Set());
    setTimeout(() => Promise.allSettled(ids.map((id) => refreshQueryData(id))), 3000);
  }, [refreshQueryData]);

  const handleToggleSelectMode = useCallback(() => {
    if (selectMode) {
      setCheckedIds(new Set());
    }
    setSelectMode((s) => !s);
  }, [selectMode]);

  const handleLogout = useCallback(() => {
    if (isDemoMode()) {
      demoLogout();
      window.location.reload();
    } else {
      logout();
    }
  }, []);

  const goHome = useCallback(() => { setView("home"); window.history.pushState({}, "", import.meta.env.BASE_URL); }, []);
  const goCategory = useCallback((cat: string) => {
    setSelectedCategory(cat);
    setView("category");
    window.history.pushState({ category: cat }, "", `?category=${encodeURIComponent(cat)}`);
  }, []);

  const goKpi = useCallback((month?: string) => {
    const m = month ?? kpiMonth;
    setKpiMonth(m);
    setSelectedPerson(null);
    setView("kpi");
    window.history.pushState({ kpi: true, month: m }, "", `?kpi&month=${m}`);
  }, [kpiMonth]);

  /** `person` is an email, or a reserved `BUCKET_*` value. The month rides along so Back returns to it. */
  const goPerson = useCallback((person: string) => {
    setSelectedPerson(person);
    setView("person");
    window.history.pushState({ person, month: kpiMonth }, "", `?person=${encodeURIComponent(person)}&month=${kpiMonth}`);
  }, [kpiMonth]);

  // Changing the month while looking at one person keeps you on that person: their cases for
  // the new month. Replacing rather than pushing keeps Back meaning "leave", not "undo a click".
  const changeKpiMonth = useCallback((m: string) => {
    setKpiMonth(m);
    const search = selectedPerson ? `?person=${encodeURIComponent(selectedPerson)}&month=${m}` : `?kpi&month=${m}`;
    window.history.replaceState({ person: selectedPerson, month: m }, "", search);
  }, [selectedPerson]);

  const selectQuery = useCallback((q: MonitoringQuery) => {
    setSelectedQuery(q);
    setRunError(null); // a failed-run message belongs to the item it was raised on
    setView("query");
    setHistoryOpen(false);
    window.history.pushState({ queryId: q.msorId }, "", `?id=${q.msorId}`);
  }, []);

  const handleOpenHistory = useCallback((q: MonitoringQuery) => {
    setSelectedQuery(q);
    setView("query");
    setHistoryOpen(true);
    window.history.pushState({ queryId: q.msorId }, "", `?id=${q.msorId}`);
  }, []);

  // Back/Forward means "leave this screen", and a modal must leave with it. Left mounted, its
  // backdrop covers whatever the navigation landed on and swallows every click, and none of
  // these modals close on Escape or on a backdrop click — the page looks merely dimmed and is
  // in fact dead until the user finds the close button.
  const closeOverlays = useCallback(() => {
    setHistoryOpen(false);
    setEditingQueryTarget(null);
    setCreatingQuery(false);
    setConfirmDeleteQuery(null);
    setRunSelectionOpen(false);
    setShowUserAdmin(false);
    setSectionMenuOpen(false);
  }, []);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      closeOverlays();
      const id = (e.state as { queryId?: number } | null)?.queryId;
      if (id != null) { const q = queries.find((q) => q.msorId === id); if (q) { setSelectedQuery(q); setView("query"); return; } }
      const params = new URLSearchParams(window.location.search);
      // Read the month back off the URL, not off state: going Back into October must restore
      // October, not whatever month the last forward navigation happened to leave behind.
      const month = params.get("month");
      if (month) setKpiMonth(month);
      const person = params.get("person");
      if (person) { setSelectedPerson(person); setView("person"); return; }
      setSelectedPerson(null);
      if (params.has("kpi")) { setView("kpi"); return; }
      const cat = params.get("category");
      if (cat) { setSelectedCategory(cat); setView("category"); return; }
      setView("home");
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [queries, closeOverlays]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const queryColorMap = useMemo(
    () => Object.fromEntries(queries.map((q, idx) => [q.msorId, q.color ?? QUERY_COLORS[idx % QUERY_COLORS.length]])),
    [queries],
  );

  const filteredSidebarQueries = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return queries;
    return queries.filter((query) =>
      query.title.toLowerCase().includes(q) || query.description?.toLowerCase().includes(q)
      || query.dbType?.toLowerCase().includes(q) || query.category?.toLowerCase().includes(q),
    );
  }, [queries, sidebarSearch]);

  // Sidebar items grouped by category. Groups start collapsed, so the expanded
  // ones are the exception we track.
  const groupedSidebarQueries = useMemo(() => groupByCategory(filteredSidebarQueries), [filteredSidebarQueries]);
  const [expandedSidebarCats, setExpandedSidebarCats] = useState<Set<string>>(new Set());
  const toggleSidebarCat = useCallback((cat: string) => {
    setExpandedSidebarCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  // A search expands every group it matched, so the hits aren't hidden behind a
  // chevron; clearing the search returns to the collapsed default.
  const groupedSidebarQueriesRef = useRef(groupedSidebarQueries);
  useEffect(() => { groupedSidebarQueriesRef.current = groupedSidebarQueries; }, [groupedSidebarQueries]);
  useEffect(() => {
    const matched = sidebarSearch.trim() ? groupedSidebarQueriesRef.current.map((g) => g.category) : [];
    setExpandedSidebarCats(new Set(matched));
  }, [sidebarSearch]);

  // Category suggestions for the create/edit forms: the standard taxonomy plus
  // any custom categories already in use, taxonomy order first then extras.
  const allKnownCategories = useMemo(() => {
    const extras = [...new Set(queries.map((q) => q.category).filter((c): c is string => !!c && !CATEGORY_ORDER.includes(c)))].sort((a, b) => a.localeCompare(b));
    return [...CATEGORY_ORDER, ...extras];
  }, [queries]);

  // Items excluded from dashboard totals/status/pies because they are on hold
  // (their cases can't be resolved right now — blocked on an external action).
  const activeQueries = useMemo(() => queries.filter((q) => q.onHoldYn !== "Y"), [queries]);

  // Total case count across all queries (latest result per query), on-hold excluded
  const totalCaseCount = useMemo(() => {
    return activeQueries.reduce((sum, q) => {
      const latest = latestMap[q.msorId];
      return sum + (latest?.resultCount ?? 0);
    }, 0);
  }, [activeQueries, latestMap]);

  // Pie chart data: case count per category (latest run), on-hold excluded.
  // Each slice is a category, colored by its stable category color.
  const homePieData = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const q of activeQueries) {
      const count = latestMap[q.msorId]?.resultCount ?? 0;
      if (count <= 0) continue;
      const cat = q.category ?? CATEGORY_FALLBACK;
      byCat.set(cat, (byCat.get(cat) ?? 0) + count);
    }
    return [...byCat.entries()]
      .map(([category, value]) => ({ name: category, value, color: categoryColor(category) }))
      .sort((a, b) => b.value - a.value || categoryRank(a.name) - categoryRank(b.name));
  }, [activeQueries, latestMap]);

  // Pie chart data: case status breakdown across active items (latest run each)
  const caseStatusPieData = useMemo(() => {
    const counts: Record<RowStatus, number> = { OPEN: 0, IN_PROGRESS: 0, DONE: 0 };
    activeQueries.forEach((q) => {
      const results = homeResults[q.msorId] ?? [];
      const latest = results[results.length - 1];
      (latest?.rows ?? []).forEach((row) => { counts[row.rowStatus] = (counts[row.rowStatus] ?? 0) + 1; });
    });
    return [
      { name: "Open", value: counts.OPEN, color: ROW_STATUS_COLORS.OPEN },
      { name: "In Progress", value: counts.IN_PROGRESS, color: ROW_STATUS_COLORS.IN_PROGRESS },
      { name: "Done", value: counts.DONE, color: ROW_STATUS_COLORS.DONE },
    ].filter((d) => d.value > 0);
  }, [activeQueries, homeResults]);

  const caseStatusTotal = useMemo(
    () => caseStatusPieData.reduce((sum, d) => sum + d.value, 0),
    [caseStatusPieData],
  );

  // ── Case age ──────────────────────────────────────────────────────────────
  // One fetch, three pies. `today` is recomputed whenever the rows are, so an open
  // session rolls over midnight on the next refresh rather than sticking on a stale date.
  const firstSeenByKey = useMemo(
    () => new Map(caseRows.map((r) => [`${r.msorId}:${r.caseKey}`, r.runDate])),
    [caseRows],
  );

  // ── KPI ───────────────────────────────────────────────────────────────────
  // Derived once here rather than inside each view, so the tab and the drill-down cannot
  // disagree about which cases belong to whom.
  const kpiData = useMemo(
    () => (workload ? buildKpiData(workload, caseRows) : null),
    [workload, caseRows],
  );

  /** Title, subtitle and case set for whichever card was clicked — a person, or one of the two buckets. */
  const personViewProps = useMemo(() => {
    const empty = { title: "", subtitle: "", caseKeys: new Set<string>() };
    if (!selectedPerson || !kpiData) return empty;

    if (selectedPerson === BUCKET_UNATTENDED) {
      return {
        title: "Unattended",
        subtitle: "unresolved cases nobody touched",
        caseKeys: kpiData.unattended.keys,
      };
    }
    if (selectedPerson === BUCKET_UNATTRIBUTED) {
      return {
        title: "Unattributed",
        subtitle: "touched by an entry that carries no author",
        caseKeys: kpiData.unattributed.keys,
      };
    }

    const person = kpiData.people.find((p) => p.email === selectedPerson);
    // A deep link to somebody who touched nothing this month is legitimate — an empty page
    // that names them beats a redirect that pretends they do not exist.
    if (!person) return { title: selectedPerson, subtitle: "no cases touched", caseKeys: new Set<string>() };
    return {
      title: person.name ?? person.email,
      subtitle: person.name ? person.email : "cases touched",
      caseKeys: person.keys,
    };
  }, [selectedPerson, kpiData]);

  // The rows of each active item's latest run — the same population totalCaseCount and
  // caseStatusPieData count, so the age pie reconciles with both by construction.
  const latestRowsOf = useCallback((qs: MonitoringQuery[]) => {
    const rows: { msorId: number; caseKey: string; caseKeySource: CaseKeySource | null; rowStatus: RowStatus }[] = [];
    for (const q of qs) {
      const results = homeResults[q.msorId] ?? [];
      const latest = results[results.length - 1];
      for (const row of latest?.rows ?? []) {
        rows.push({ msorId: q.msorId, caseKey: row.caseKey, caseKeySource: row.caseKeySource, rowStatus: row.rowStatus });
      }
    }
    return rows;
  }, [homeResults]);

  const homeCaseAgeData = useMemo(
    () => buildCaseAgeData(latestRowsOf(activeQueries), firstSeenByKey, nyToday()),
    [activeQueries, latestRowsOf, firstSeenByKey],
  );

  // "New today" is the Today bucket minus cases already resolved: the badge answers
  // "what landed on me today", the pie answers "how old is this backlog". The two are
  // deliberately different numbers, so the badge tooltip explains the gap.
  const newToday = useMemo(() => {
    const today = nyToday();
    const rows = latestRowsOf(activeQueries).filter((r) => {
      if (!isAgeable(r)) return false;
      const firstSeen = firstSeenByKey.get(`${r.msorId}:${r.caseKey}`);
      // caseAgeBucket, not `firstSeen === today` — both must agree on a future first_date.
      return firstSeen != null && caseAgeBucket(firstSeen, today) === 0;
    });
    return {
      count: rows.filter((r) => r.rowStatus !== "DONE").length,
      resolved: rows.filter((r) => r.rowStatus === "DONE").length,
    };
  }, [activeQueries, latestRowsOf, firstSeenByKey]);

  // Per-category pie data: for each category, a by-item pie and a by-status pie.
  const categoryStats = useMemo(() => {
    const today = nyToday();
    const map = new Map<string, {
      byItem: PieSlice[];
      counts: Record<RowStatus, number>;
      items: MonitoringQuery[];
    }>();
    for (const q of queries) {
      const cat = q.category ?? CATEGORY_FALLBACK;
      let entry = map.get(cat);
      if (!entry) { entry = { byItem: [], counts: { OPEN: 0, IN_PROGRESS: 0, DONE: 0 }, items: [] }; map.set(cat, entry); }
      if (q.onHoldYn === "Y") continue; // category stays listed, but on-hold cases are excluded
      entry.items.push(q);
      const count = latestMap[q.msorId]?.resultCount ?? 0;
      if (count > 0) entry.byItem.push({ name: q.title, value: count, color: queryColorMap[q.msorId] ?? QUERY_COLORS[0], msorId: q.msorId });
      const results = homeResults[q.msorId] ?? [];
      const latest = results[results.length - 1];
      (latest?.rows ?? []).forEach((row) => { entry.counts[row.rowStatus] = (entry.counts[row.rowStatus] ?? 0) + 1; });
    }
    return [...map.entries()]
      .map(([category, e]) => ({
        category,
        byItem: [...e.byItem].sort((a, b) => b.value - a.value),
        byStatus: [
          { name: "Open", value: e.counts.OPEN, color: ROW_STATUS_COLORS.OPEN },
          { name: "In Progress", value: e.counts.IN_PROGRESS, color: ROW_STATUS_COLORS.IN_PROGRESS },
          { name: "Done", value: e.counts.DONE, color: ROW_STATUS_COLORS.DONE },
        ].filter((d) => d.value > 0),
        byAge: buildCaseAgeData(latestRowsOf(e.items), firstSeenByKey, today),
        totalCases: e.byItem.reduce((s, d) => s + d.value, 0),
      }))
      .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category));
  }, [queries, latestMap, homeResults, queryColorMap, latestRowsOf, firstSeenByKey]);

  const categoryStatByName = useMemo(
    () => Object.fromEntries(categoryStats.map((c) => [c.category, c])),
    [categoryStats],
  );

  // All run dates for the selected query (for detail page calendar highlights)
  const itemAvailableDates = useMemo(() => new Set(allResults.map((r) => r.runDate)), [allResults]);

  // Row status pie data for monitoring item page
  const rowStatusPieData = useMemo(() => {
    if (!selectedResult?.rows?.length) return [];
    const counts: Record<RowStatus, number> = { OPEN: 0, IN_PROGRESS: 0, DONE: 0 };
    selectedResult.rows.forEach((r) => { counts[r.rowStatus] = (counts[r.rowStatus] ?? 0) + 1; });
    return [
      { name: "Open", value: counts.OPEN, color: ROW_STATUS_COLORS.OPEN },
      { name: "In Progress", value: counts.IN_PROGRESS, color: ROW_STATUS_COLORS.IN_PROGRESS },
      { name: "Done", value: counts.DONE, color: ROW_STATUS_COLORS.DONE },
    ].filter((d) => d.value > 0);
  }, [selectedResult]);

  // Scoped to the *selected* run, so the pie agrees with the table and the status pie
  // beside it. Bucketing selectedResult.rows (rather than filtering caseRows by resultId)
  // is also what keeps a historical date correct: findAllCasesRows keeps only each case's
  // latest sighting, so a case last seen after the selected run is absent from caseRows
  // entirely — but its caseKey still resolves through firstSeenByKey.
  const itemCaseAgeData = useMemo(() => {
    if (!selectedQuery || !selectedResult?.rows?.length) return EMPTY_CASE_AGE;
    const rows = selectedResult.rows.map((r) => ({ msorId: selectedQuery.msorId, caseKey: r.caseKey, caseKeySource: r.caseKeySource }));
    return buildCaseAgeData(rows, firstSeenByKey, nyToday());
  }, [selectedQuery, selectedResult, firstSeenByKey]);

  // ── Section menu close ────────────────────────────────────────────────────

  useEffect(() => {
    if (!sectionMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (sectionMenuTriggerRef.current && !sectionMenuTriggerRef.current.contains(e.target as Node)) setSectionMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [sectionMenuOpen]);

  // ── Effective rows with draft patches ────────────────────────────────────

  const effectiveRows = useMemo(() => {
    if (!selectedResult) return [];
    return selectedResult.rows.map((r) => ({ ...r, ...(draftRows[r.rowId] ?? {}) }));
  }, [selectedResult, draftRows]);

  const hasUnsavedChanges = Object.keys(draftRows).length > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className={cn("shrink-0 border-r bg-sidebar flex flex-col overflow-hidden transition-[width] duration-200", sidebarOpen ? "w-64" : "w-0")}>
        <div className="w-64 flex items-center h-14 border-b shrink-0">
          <button onClick={() => setSidebarOpen((o) => !o)} className="flex items-center justify-center w-10 h-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer" title="Toggle sidebar">
            <Menu className="h-4 w-4" />
          </button>
          <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-semibold text-sm ml-2 flex-1">Monitoring Dashboard</span>
        </div>

        <div className="px-2 pt-3 pb-1 shrink-0 space-y-0.5">
          <button onClick={goHome} className={cn("w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors cursor-pointer flex items-center gap-2", view === "home" ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
            <Home className="h-4 w-4 shrink-0" />
            Home
          </button>
          {/* Beneath Home, and stays lit while drilled into a person — the person page is part of KPI. */}
          <button onClick={() => goKpi()} className={cn("w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors cursor-pointer flex items-center gap-2", view === "kpi" || view === "person" ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
            <Users className="h-4 w-4 shrink-0" />
            KPI
          </button>
        </div>

        <div className="flex items-center px-4 pt-3 pb-1 shrink-0">
          <button onClick={() => setItemsOpen((o) => !o)} className="flex items-center gap-1 flex-1 cursor-pointer group">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monitoring Items</p>
            <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform duration-200", !itemsOpen && "-rotate-90")} />
          </button>
          <button ref={sectionMenuTriggerRef} onClick={() => { if (!sectionMenuTriggerRef.current) return; const rect = sectionMenuTriggerRef.current.getBoundingClientRect(); setSectionMenuPos({ top: rect.bottom + 4, left: rect.right - 192 }); setSectionMenuOpen((o) => !o); }} className={cn("rounded p-0.5 transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent", sectionMenuOpen && "bg-accent text-foreground")} title="Monitoring items actions">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>

        {sectionMenuOpen && createPortal(
          <div style={{ position: "fixed", top: sectionMenuPos.top, left: sectionMenuPos.left, zIndex: 9999 }} className="w-48 rounded-md border bg-background shadow-lg py-0.5" onMouseDown={(e) => e.stopPropagation()}>
            <button onClick={() => { setSectionMenuOpen(false); setCreatingQuery(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"><Plus className="h-3.5 w-3.5" />Create New Item</button>
            <button onClick={() => { setSectionMenuOpen(false); handleToggleSelectMode(); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"><MousePointerClick className="h-3.5 w-3.5" />{selectMode ? "Cancel Selection" : "Select Items"}</button>
            <button onClick={() => { setSectionMenuOpen(false); setRunSelectionOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"><Play className="h-3.5 w-3.5" />{checkedIds.size > 0 ? `Run ${checkedIds.size} Selected` : "Run Items"}</button>
          </div>,
          document.body,
        )}

        {itemsOpen && (
          <div className="px-2 pb-1 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input type="text" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="Search…" className="w-full rounded-md border border-input bg-background pl-7 pr-7 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              {sidebarSearch && <button onClick={() => setSidebarSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"><X className="h-3 w-3" /></button>}
            </div>
          </div>
        )}

        {itemsOpen && (
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
            {(() => {
              if (loadingQueries) return Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />);
              if (filteredSidebarQueries.length === 0) return <p className="px-3 py-4 text-xs text-muted-foreground text-center">No items match</p>;
              return groupedSidebarQueries.map(({ category, items }) => {
                    const isCollapsed = !expandedSidebarCats.has(category);
                    const itemIds = items.map((q) => q.msorId);
                    const allChecked = itemIds.length > 0 && itemIds.every((id) => checkedIds.has(id));
                    const someChecked = itemIds.some((id) => checkedIds.has(id));
                    return (
                      <div key={category}>
                        <div className={cn("flex w-full items-center gap-1 pr-2 rounded-md transition-colors", view === "category" && selectedCategory === category ? "bg-accent" : "hover:bg-accent/60")}>
                          {selectMode && (
                            <input
                              type="checkbox"
                              checked={allChecked}
                              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                              onChange={() => toggleCategoryCheck(itemIds)}
                              onClick={(e) => e.stopPropagation()}
                              className="ml-2 shrink-0 cursor-pointer"
                              title="Select all items in this category"
                            />
                          )}
                          <button
                            onClick={() => toggleSidebarCat(category)}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                            title={isCollapsed ? "Expand" : "Collapse"}
                          >
                            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => goCategory(category)}
                            className="flex flex-1 items-center gap-2 py-1.5 min-w-0 cursor-pointer text-left"
                            title={`Open ${category}`}
                          >
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: categoryColor(category) }} />
                            <span className={cn("text-base font-semibold truncate", view === "category" && selectedCategory === category ? "text-foreground" : "text-foreground/80")}>{category}</span>
                            <span className="ml-auto rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground shrink-0">{items.length}</span>
                          </button>
                        </div>
                        {!isCollapsed && (
                          <div className="mt-0.5 ml-3 space-y-0.5 border-l border-border pl-1.5">
                            {items.map((q) => (
                              <SidebarItem
                                key={q.msorId} query={q}
                                selected={view === "query" && selectedQuery?.msorId === q.msorId}
                                checked={checkedIds.has(q.msorId)}
                                selectMode={selectMode}
                                latestResult={latestMap[q.msorId] ?? null}
                                color={queryColorMap[q.msorId] ?? QUERY_COLORS[0]}
                                onClick={() => selectQuery(q)}
                                onToggleCheck={() => toggleCheck(q.msorId)}
                                onRun={() => handleRun(q.msorId)}
                                onEdit={() => setEditingQueryTarget(q)}
                                onHistory={() => handleOpenHistory(q)}
                                onDelete={() => setConfirmDeleteQuery(q)}
                                onToggleOnHold={() => handleToggleOnHold(q)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
            })()}
          </div>
        )}

        <div className="border-t px-4 py-3 shrink-0">
          <button onClick={loadQueries} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="shrink-0 border-b bg-background h-14 flex items-center px-4 gap-3">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0" title="Open sidebar">
              <Menu className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1 flex items-center justify-center">
            <GlobalSearch queries={queries} queryColorMap={queryColorMap} latestMap={latestMap} checkedIds={checkedIds} onToggleCheck={toggleCheck} onSelect={selectQuery} onRun={handleRun} onEdit={setEditingQueryTarget} onDelete={setConfirmDeleteQuery} />
          </div>
          {canManageUsers && (
            <button onClick={() => setShowUserAdmin(true)} className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0" title="Manage users">
              <UserPlus className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setDarkMode((d) => !d)} className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0" title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={handleLogout} className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {showUserAdmin && <UserAdminModal onClose={() => setShowUserAdmin(false)} />}

        {(() => {
          if (view === "kpi") return (
          <KpiView
            month={kpiMonth}
            data={kpiData}
            earliestMonth={workload?.earliestMonth ?? null}
            loading={loadingWorkload || loadingCaseRows}
            error={workloadError}
            totalCases={caseRows.length}
            onChangeMonth={changeKpiMonth}
            onOpenPerson={goPerson}
            onOpenBucket={goPerson}
            onRetry={() => loadWorkload(kpiMonth)}
          />
          );
          if (view === "person" && selectedPerson) return (
          <PersonView
            {...personViewProps}
            month={kpiMonth}
            caseRows={caseRows}
            firstSeenByKey={firstSeenByKey}
            loadingCaseRows={loadingCaseRows || loadingWorkload}
            queries={queries}
            queryColorMap={queryColorMap}
            onSelectQuery={selectQuery}
            onSelectCategory={goCategory}
            onBack={() => goKpi()}
            onRowsSaved={refreshAfterRowWrite}
          />
          );
          if (view === "category" && selectedCategory) return (
          <CategoryView
            category={selectedCategory}
            stat={categoryStatByName[selectedCategory]}
            itemCount={queries.filter((q) => (q.category ?? CATEGORY_FALLBACK) === selectedCategory).length}
            queries={queries}
            queryColorMap={queryColorMap}
            loadingCaseRows={loadingCaseRows}
            onSelectQuery={selectQuery}
            onSelectCategory={goCategory}
            onBack={goHome}
          />
          );
          if (view === "home") return (
          <HomeView
            queries={queries}
            loadingQueries={loadingQueries}
            totalCaseCount={totalCaseCount}
            homePieData={homePieData}
            caseStatusPieData={caseStatusPieData}
            caseStatusTotal={caseStatusTotal}
            caseAgeData={homeCaseAgeData}
            loadingCaseRows={loadingCaseRows}
            newToday={newToday}
            queryColorMap={queryColorMap}
            onSelectQuery={selectQuery}
            onSelectCategory={goCategory}
          />
          );
          if (!selectedQuery) return (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <Activity className="mb-4 h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">Select a monitoring item</p>
            <p className="mt-1 text-xs">Choose an item from the left sidebar to view results</p>
          </div>
          );
          return (
          <QueryDetailView
            selectedQuery={selectedQuery}
            selectedResult={selectedResult}
            allResults={allResults}
            loadingResults={loadingResults}
            loadingRows={loadingRows}
            effectiveRows={effectiveRows}
            rowStatusPieData={rowStatusPieData}
            itemCaseAgeData={itemCaseAgeData}
            loadingCaseRows={loadingCaseRows}
            hasUnsavedChanges={hasUnsavedChanges}
            savingRows={savingRows}
            itemAvailableDates={itemAvailableDates}
            triggeringId={triggeringId}
            queryColorMap={queryColorMap}
            scanWindow={scanWindow}
            runError={runError}
            firstSeenByKey={firstSeenByKey}
            onGoHome={goHome}
            onDateSelect={(r) => handleDateSelect(r)}
            onEdit={setEditingQueryTarget}
            onOpenHistory={() => setHistoryOpen(true)}
            onRun={(id, w) => handleRun(id, w)}
            onScanWindowChange={setScanWindow}
            onDelete={setConfirmDeleteQuery}
            onSaveChanges={() => handleSaveChanges()}
            onChangeRow={handleChangeRow}
            onBulkUpdate={handleBulkUpdateRows}
          />
          );
        })()}
      </main>

      {historyOpen && selectedQuery && (
        <QueryHistoryModal query={selectedQuery} results={allResults} onClose={() => setHistoryOpen(false)} />
      )}
      {runSelectionOpen && (
        <RunSelectionModal queries={queries} queryColorMap={queryColorMap} initialSelected={checkedIds} onClose={() => setRunSelectionOpen(false)} onRun={handleRunSelected} />
      )}
      {creatingQuery && (
        <CreateQueryModal categoryOptions={allKnownCategories} onClose={() => setCreatingQuery(false)} onCreated={(created) => { setQueries((qs) => [...qs, created]); setCreatingQuery(false); }} />
      )}
      {editingQueryTarget && (
        <EditQueryModal query={editingQueryTarget} categoryOptions={allKnownCategories} defaultColor={queryColorMap[editingQueryTarget.msorId] ?? QUERY_COLORS[0]} onClose={() => setEditingQueryTarget(null)}
          onSaved={(updated) => { if (selectedQuery?.msorId === updated.msorId) setSelectedQuery(updated); setQueries((qs) => qs.map((q) => (q.msorId === updated.msorId ? updated : q))); setEditingQueryTarget(null); }}
        />
      )}
      {confirmDeleteQuery && (
        <DeleteConfirmModal query={confirmDeleteQuery} deleting={deletingInProgress} onClose={() => setConfirmDeleteQuery(null)} onConfirm={() => handleDelete(confirmDeleteQuery)} />
      )}
    </div>
  );
}
