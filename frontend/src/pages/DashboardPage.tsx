import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Home,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchQueries, fetchResults, triggerRun, createQuery, updateQuery, deleteQuery, updateRow } from "@/api/monitoring";
import type { MonitoringQuery, MonitoringResult, MonitoringResultRow, RowStatus } from "@/types/monitoring";

// ── Constants ────────────────────────────────────────────────────────────────

const BAR_ACTIVE = "#4f46e5";
const BAR_ZERO = "#e5e7eb";

const QUERY_COLORS = [
  "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
  "#84cc16", "#a855f7", "#3b82f6", "#22c55e", "#eab308",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatFullDate(iso: string) {
  try {
    return format(parseISO(iso), "MMMM d, yyyy");
  } catch {
    return iso;
  }
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
  payload?: FollowTooltipEntry[];
  label?: string;
  formatLabel?: (label: string, payload: FollowTooltipEntry[]) => React.ReactNode;
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

// ── Sidebar item ─────────────────────────────────────────────────────────────

function SidebarItem({
  query,
  selected,
  checked,
  latestResult,
  color,
  onClick,
  onToggleCheck,
  onRun,
  onEdit,
  onDelete,
}: {
  query: MonitoringQuery;
  selected: boolean;
  checked: boolean;
  latestResult: MonitoringResult | null;
  color: string;
  onClick: () => void;
  onToggleCheck: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const count = latestResult?.resultCount ?? null;
  const isFailed = latestResult?.resultStatus === "FAIL";
  const isActive = query.activeYn === "Y";
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 144 });
    setMenuOpen((o) => !o);
  }

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-md",
        selected ? "bg-accent" : "hover:bg-accent/60",
        !isActive && "opacity-50",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggleCheck}
        onClick={(e) => e.stopPropagation()}
        className="ml-2 shrink-0 cursor-pointer"
        title="Select for run"
      />
      <button
        onClick={onClick}
        className={cn(
          "flex-1 min-w-0 text-left pl-2 pr-1 py-2.5 text-sm transition-colors cursor-pointer",
          "flex items-center gap-2",
          selected ? "text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
        <span className="truncate flex-1 leading-snug">{query.title}</span>
        {isFailed && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        )}
        {!isFailed && count !== null && count > 0 && (
          <Badge variant="destructive" className="h-4 shrink-0 px-1 py-0 text-[10px] leading-none">
            {count}
          </Badge>
        )}
      </button>

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
            onClick={() => { setMenuOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Home grid card ────────────────────────────────────────────────────────────

function QueryCard({
  query,
  results,
  color,
  checked,
  onSelect,
  onToggleCheck,
  onRun,
  onEdit,
  onDelete,
}: {
  query: MonitoringQuery;
  results: MonitoringResult[];
  color: string;
  checked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const latestResult = results.length > 0 ? results[results.length - 1] : null;
  const latestCount = latestResult?.resultCount ?? null;
  const isFailed = latestResult?.resultStatus === "FAIL";
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 144 });
    setMenuOpen((o) => !o);
  }

  const chartData = results.map((r) => ({
    date: formatDate(r.runDate),
    count: r.resultCount,
  }));

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-sm overflow-hidden",
        checked && "ring-2 ring-primary/40",
      )}
      style={{ borderLeft: `3px solid ${color}` }}
      onClick={onSelect}
    >
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggleCheck}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 shrink-0 cursor-pointer"
              title="Select for run"
            />
            <CardTitle className="line-clamp-2 text-sm font-semibold leading-snug flex-1">
              {query.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isFailed && (
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            )}
            {!isFailed && latestCount !== null && latestCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {latestCount}
              </Badge>
            )}
            <button
              ref={triggerRef}
              onClick={openMenu}
              className={cn(
                "rounded p-0.5 transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent",
                menuOpen && "bg-accent text-foreground",
              )}
              title="More options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {query.dbType && (
          <Badge variant="outline" className="mt-1 w-fit text-[10px]">
            {query.dbType}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {chartData.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
            No data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <Tooltip
                content={(props) => (
                  <FollowTooltip
                    {...(props as Parameters<typeof FollowTooltip>[0])}
                    formatLabel={(_, p) => String(p?.[0]?.payload?.date ?? "")}
                    formatValue={(v) => `${v} case${v !== 1 ? "s" : ""}`}
                  />
                )}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.count === 0 ? BAR_ZERO : color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>

      {menuOpen && createPortal(
        <div
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-36 rounded-md border bg-background shadow-lg py-0.5"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRun(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <Zap className="h-3.5 w-3.5" />
            Run Now
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>,
        document.body,
      )}
    </Card>
  );
}

// ── Row status options ────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: RowStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

function statusSelectClass(status: RowStatus) {
  if (status === "IN_PROGRESS") return "border-amber-300 bg-amber-50 text-amber-700";
  if (status === "DONE") return "border-green-300 bg-green-50 text-green-700";
  return "border-gray-300 bg-gray-50 text-gray-700";
}

// ── Inline status dropdown ────────────────────────────────────────────────────

function RowStatusSelect({
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
    try {
      await onUpdate(row.rowId, newStatus, row.rowComment);
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={row.rowStatus}
      onChange={handleChange}
      disabled={saving}
      className={cn(
        "text-xs rounded border px-1.5 py-0.5 outline-none cursor-pointer disabled:opacity-50",
        statusSelectClass(row.rowStatus),
      )}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ── Inline comment input ──────────────────────────────────────────────────────

function CommentInput({
  row,
  onUpdate,
}: {
  row: MonitoringResultRow;
  onUpdate: (rowId: number, status: RowStatus, comment: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(row.rowComment ?? "");

  useEffect(() => {
    setDraft(row.rowComment ?? "");
  }, [row.rowComment]);

  const handleBlur = async () => {
    const newComment = draft.trim() || null;
    if (newComment !== row.rowComment) {
      await onUpdate(row.rowId, row.rowStatus, newComment);
    }
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void handleBlur()}
      placeholder="Add comment…"
      className="text-xs w-full min-w-[140px] rounded border border-input bg-background px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

// ── Error panel ───────────────────────────────────────────────────────────────

function ErrorPanel({ message, detail }: { message: string; detail: string | null }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="shrink-0 rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">Execution failed</p>
          <p className="mt-0.5 text-sm text-destructive/80 break-words">{message}</p>
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
        <pre className="mt-2 overflow-x-auto rounded bg-destructive/10 px-3 py-2 text-[11px] leading-relaxed text-destructive/90 whitespace-pre-wrap break-all">
          {detail}
        </pre>
      )}
    </div>
  );
}

// ── Results rows table ────────────────────────────────────────────────────────

function RowsTable({
  rows,
  onUpdateRow,
}: {
  rows: MonitoringResultRow[];
  onUpdateRow: (rowId: number, status: RowStatus, comment: string | null) => Promise<void>;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        No cases found for this date
      </div>
    );
  }

  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r.data))));

  return (
    <div>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-48">Comments</TableHead>
            {columns.map((col) => (
              <TableHead key={col}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={row.rowId}>
              <TableCell className="text-center text-xs text-muted-foreground tabular-nums">{idx + 1}</TableCell>
              <TableCell>
                <RowStatusSelect row={row} onUpdate={onUpdateRow} />
              </TableCell>
              <TableCell>
                <CommentInput row={row} onUpdate={onUpdateRow} />
              </TableCell>
              {columns.map((col) => (
                <TableCell key={col} className="whitespace-nowrap font-mono text-xs">
                  {row.data[col] === null || row.data[col] === undefined ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    String(row.data[col])
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Edit query modal ──────────────────────────────────────────────────────────

function EditQueryModal({
  query,
  defaultColor,
  onClose,
  onSaved,
}: {
  query: MonitoringQuery;
  defaultColor: string;
  onClose: () => void;
  onSaved: (updated: MonitoringQuery) => void;
}) {
  const [form, setForm] = useState({
    title: query.title,
    description: query.description ?? "",
    dbType: query.dbType,
    sheetName: query.sheetName ?? "",
    ownerName: query.ownerName ?? "",
    ownerEmail: query.ownerEmail ?? "",
    queryInterval: query.queryInterval ?? "",
    recipients: query.recipients ?? "",
    sqlQuery: query.sqlQuery,
    activeYn: query.activeYn,
    frequentYn: query.frequentYn,
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
        sheetName: form.sheetName.trim() || null,
        ownerName: form.ownerName.trim() || null,
        ownerEmail: form.ownerEmail.trim() || null,
        queryInterval: form.queryInterval.trim() || null,
        recipients: form.recipients.trim() || null,
        sqlQuery: form.sqlQuery,
        activeYn: form.activeYn,
        frequentYn: form.frequentYn,
        color: form.color || null,
      });
      onSaved({
        ...query,
        title: form.title.trim(),
        description: form.description.trim() || null,
        dbType: form.dbType.trim(),
        sheetName: form.sheetName.trim() || null,
        ownerName: form.ownerName.trim() || null,
        ownerEmail: form.ownerEmail.trim() || null,
        queryInterval: form.queryInterval.trim() || null,
        recipients: form.recipients.trim() || null,
        sqlQuery: form.sqlQuery,
        activeYn: form.activeYn,
        frequentYn: form.frequentYn,
        color: form.color || null,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-2xl rounded-lg border bg-background shadow-xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Edit Monitoring Item</h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form id="edit-query-form" onSubmit={(e) => void handleSubmit(e)} className="overflow-y-auto flex-1">
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Title</label>
                <input
                  className={fieldClass}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Monitoring item title"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>DB Type</label>
                <select
                  className={fieldClass}
                  value={form.dbType}
                  onChange={(e) => setForm((f) => ({ ...f, dbType: e.target.value }))}
                >
                  <option value="DATABASE1">DATABASE1</option>
                  <option value="DATABASE2">DATABASE2</option>
                  <option value="DATABASE3">DATABASE3</option>
                  <option value="DATABASE4">DATABASE4</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <input
                className={fieldClass}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description of this monitoring item"
              />
            </div>

            <div>
              <label className={labelClass}>Sheet Name</label>
              <input
                className={fieldClass}
                value={form.sheetName}
                onChange={(e) => setForm((f) => ({ ...f, sheetName: e.target.value }))}
                placeholder="Excel sheet name for reports"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Owner Name</label>
                <input
                  className={fieldClass}
                  value={form.ownerName}
                  onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className={labelClass}>Owner Email</label>
                <input
                  type="email"
                  className={fieldClass}
                  value={form.ownerEmail}
                  onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                  placeholder="e.g. john@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Query Interval</label>
                <input
                  className={fieldClass}
                  value={form.queryInterval}
                  onChange={(e) => setForm((f) => ({ ...f, queryInterval: e.target.value }))}
                  placeholder="e.g. 0 9 * * *"
                />
              </div>
              <div>
                <label className={labelClass}>Recipients</label>
                <input
                  className={fieldClass}
                  value={form.recipients}
                  onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))}
                  placeholder="Comma-separated emails"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Active</label>
                <select
                  className={fieldClass}
                  value={form.activeYn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, activeYn: e.target.value as "Y" | "N" }))
                  }
                >
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Frequent</label>
                <select
                  className={fieldClass}
                  value={form.frequentYn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, frequentYn: e.target.value as "Y" | "N" }))
                  }
                >
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Color</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={form.color || "#4f46e5"}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-0.5"
                  title="Pick a color"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, color: v }));
                  }}
                  placeholder="#rrggbb  (optional)"
                  maxLength={7}
                  className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                />
                {form.color && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: "" }))}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                    title="Clear color"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={labelClass}>SQL Query</label>
              <textarea
                className={cn(fieldClass, "font-mono text-xs resize-none")}
                rows={8}
                value={form.sqlQuery}
                onChange={(e) => setForm((f) => ({ ...f, sqlQuery: e.target.value }))}
                spellCheck={false}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-query-form"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Search result row ─────────────────────────────────────────────────────────

function SearchResultRow({
  query,
  color,
  count,
  isFailed,
  checked,
  onToggleCheck,
  onSelect,
  onRun,
  onEdit,
  onDelete,
}: {
  query: MonitoringQuery;
  color: string;
  count: number | null;
  isFailed: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onSelect: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 144 });
    setMenuOpen((o) => !o);
  }

  return (
    <li className="group flex items-center hover:bg-accent transition-colors">
      <div
        className="pl-4 pr-2 py-2.5 flex items-center shrink-0"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); onToggleCheck(); }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleCheck}
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
        />
      </div>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelect}
        className="flex flex-1 items-center gap-3 py-2.5 text-sm cursor-pointer text-left min-w-0"
      >
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
        <span className="flex-1 truncate">{query.title}</span>
        {query.dbType && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {query.dbType}
          </Badge>
        )}
        {isFailed && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        )}
        {!isFailed && count !== null && count > 0 && (
          <Badge variant="destructive" className="shrink-0 text-[10px]">
            {count}
          </Badge>
        )}
      </button>
      <button
        ref={triggerRef}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openMenu}
        className={cn(
          "shrink-0 mr-2 rounded p-1 transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent",
          "opacity-0 group-hover:opacity-100 focus:opacity-100",
          menuOpen && "opacity-100",
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
            onClick={() => { setMenuOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-accent transition-colors cursor-pointer rounded-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>,
        document.body,
      )}
    </li>
  );
}

// ── Global search bar ─────────────────────────────────────────────────────────

function GlobalSearch({
  queries,
  queryColorMap,
  latestMap,
  checkedIds,
  onToggleCheck,
  onSelect,
  onRun,
  onEdit,
  onDelete,
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
    return queries
      .filter(
        (query) =>
          query.title.toLowerCase().includes(q) ||
          query.description?.toLowerCase().includes(q) ||
          query.dbType?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [queries, value]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleSelect(q: MonitoringQuery) {
    setValue("");
    setOpen(false);
    onSelect(q);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search monitoring items…"
          className="w-full rounded-lg border border-input bg-background pl-10 pr-9 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring shadow-sm"
        />
        {value && (
          <button
            onClick={() => { setValue(""); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && value && (
        <div className="absolute top-full mt-1.5 w-full rounded-lg border bg-background shadow-lg z-50 overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No items match &ldquo;{value}&rdquo;
            </p>
          ) : (
            <ul>
              {results.map((q) => {
                const latest = latestMap[q.msorId];
                const count = latest?.resultCount ?? null;
                const isFailed = latest?.resultStatus === "FAIL";
                return (
                  <SearchResultRow
                    key={q.msorId}
                    query={q}
                    color={queryColorMap[q.msorId] ?? QUERY_COLORS[0]}
                    count={count}
                    isFailed={isFailed}
                    checked={checkedIds.has(q.msorId)}
                    onToggleCheck={() => onToggleCheck(q.msorId)}
                    onSelect={() => handleSelect(q)}
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
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(active.map((q) => q.msorId)));
  }

  async function handleRun() {
    if (selected.size === 0) return;
    setRunning(true);
    try {
      await onRun(Array.from(selected));
    } finally {
      setRunning(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-lg border bg-background shadow-xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Run Monitoring Items</h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-1">
          <label className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-accent transition-colors cursor-pointer text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="cursor-pointer"
            />
            Select All
          </label>
          <div className="border-t my-2" />
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active monitoring items</p>
          ) : (
            active.map((q) => (
              <label
                key={q.msorId}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(q.msorId)}
                  onChange={() => toggle(q.msorId)}
                  className="cursor-pointer"
                />
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: queryColorMap[q.msorId] ?? QUERY_COLORS[0] }}
                />
                <span className="text-sm truncate flex-1">{q.title}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-between items-center gap-2 px-6 py-4 border-t shrink-0">
          <span className="text-xs text-muted-foreground">
            {selected.size} of {active.length} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={selected.size === 0 || running}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
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

function DeleteConfirmModal({
  query,
  deleting,
  onClose,
  onConfirm,
}: {
  query: MonitoringQuery;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-sm rounded-lg border bg-background shadow-xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Delete Monitoring Item</h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">"{query.title}"</span>?
            This will permanently remove the item and all its execution history.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-md bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create query modal ────────────────────────────────────────────────────────

function CreateQueryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: MonitoringQuery) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    dbType: "DATABASE1",
    sheetName: "",
    ownerName: "",
    ownerEmail: "",
    queryInterval: "",
    recipients: "",
    sqlQuery: "",
    activeYn: "Y" as "Y" | "N",
    frequentYn: "N" as "Y" | "N",
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
        title: form.title.trim(),
        description: form.description.trim() || null,
        dbType: form.dbType.trim(),
        sheetName: form.sheetName.trim(),
        ownerName: form.ownerName.trim() || null,
        ownerEmail: form.ownerEmail.trim() || null,
        queryInterval: form.queryInterval.trim(),
        recipients: form.recipients.trim(),
        sqlQuery: form.sqlQuery,
        activeYn: form.activeYn,
        frequentYn: form.frequentYn,
        color: form.color || null,
      });
      onCreated(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-2xl rounded-lg border bg-background shadow-xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Create Monitoring Item</h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form id="create-query-form" onSubmit={(e) => void handleSubmit(e)} className="overflow-y-auto flex-1">
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Title</label>
                <input
                  className={fieldClass}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Monitoring item title"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>DB Type</label>
                <select
                  className={fieldClass}
                  value={form.dbType}
                  onChange={(e) => setForm((f) => ({ ...f, dbType: e.target.value }))}
                >
                  <option value="DATABASE1">DATABASE1</option>
                  <option value="DATABASE2">DATABASE2</option>
                  <option value="DATABASE3">DATABASE3</option>
                  <option value="DATABASE4">DATABASE4</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <input
                className={fieldClass}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description of this monitoring item"
              />
            </div>

            <div>
              <label className={labelClass}>Sheet Name</label>
              <input
                className={fieldClass}
                value={form.sheetName}
                onChange={(e) => setForm((f) => ({ ...f, sheetName: e.target.value }))}
                placeholder="Excel sheet name for reports"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Owner Name</label>
                <input
                  className={fieldClass}
                  value={form.ownerName}
                  onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className={labelClass}>Owner Email</label>
                <input
                  type="email"
                  className={fieldClass}
                  value={form.ownerEmail}
                  onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                  placeholder="e.g. john@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Query Interval</label>
                <input
                  className={fieldClass}
                  value={form.queryInterval}
                  onChange={(e) => setForm((f) => ({ ...f, queryInterval: e.target.value }))}
                  placeholder="e.g. 0 9 * * *"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Recipients</label>
                <input
                  className={fieldClass}
                  value={form.recipients}
                  onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))}
                  placeholder="Comma-separated emails"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Active</label>
                <select
                  className={fieldClass}
                  value={form.activeYn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, activeYn: e.target.value as "Y" | "N" }))
                  }
                >
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Frequent</label>
                <select
                  className={fieldClass}
                  value={form.frequentYn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, frequentYn: e.target.value as "Y" | "N" }))
                  }
                >
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Color</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={form.color || "#4f46e5"}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-0.5"
                  title="Pick a color"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, color: v }));
                  }}
                  placeholder="#rrggbb  (optional)"
                  maxLength={7}
                  className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                />
                {form.color && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: "" }))}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                    title="Clear color"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={labelClass}>SQL Query</label>
              <textarea
                className={cn(fieldClass, "font-mono text-xs resize-none")}
                rows={8}
                value={form.sqlQuery}
                onChange={(e) => setForm((f) => ({ ...f, sqlQuery: e.target.value }))}
                spellCheck={false}
                required
              />
            </div>

            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-query-form"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Read ?id= from URL on first render to restore navigation state
  const [pendingId] = useState<number | null>(() => {
    const p = new URLSearchParams(window.location.search).get("id");
    return p ? Number(p) : null;
  });
  const [view, setView] = useState<"home" | "query">(pendingId !== null ? "query" : "home");
  const [itemsOpen, setItemsOpen] = useState(true);

  const [queries, setQueries] = useState<MonitoringQuery[]>([]);
  const [loadingQueries, setLoadingQueries] = useState(true);

  // Home grid: sorted-asc results per query
  const [homeResults, setHomeResults] = useState<Record<number, MonitoringResult[]>>({});
  const [loadingHomeResults, setLoadingHomeResults] = useState(false);

  // All results for selected query (for chart data)
  const [allResults, setAllResults] = useState<MonitoringResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  // Detailed result for selected bar (includes rows)
  const [selectedResult, setSelectedResult] = useState<MonitoringResult | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);

  const [selectedQuery, setSelectedQuery] = useState<MonitoringQuery | null>(null);
  const [triggeringId, setTriggeringId] = useState<number | null>(null);
  const [editingQueryTarget, setEditingQueryTarget] = useState<MonitoringQuery | null>(null);
  const [creatingQuery, setCreatingQuery] = useState(false);
  const [confirmDeleteQuery, setConfirmDeleteQuery] = useState<MonitoringQuery | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [runSelectionOpen, setRunSelectionOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [sectionMenuPos, setSectionMenuPos] = useState({ top: 0, left: 0 });
  const sectionMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("dark-mode") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem("dark-mode", String(darkMode));
    } catch {
      // ignore
    }
  }, [darkMode]);

  // Unsaved row edits keyed by rowId
  const [draftRows, setDraftRows] = useState<Record<number, { rowStatus: RowStatus; rowComment: string | null }>>({});
  const [savingRows, setSavingRows] = useState(false);

  // Latest result per query (for sidebar count badges)
  const [latestMap, setLatestMap] = useState<Record<number, MonitoringResult | null>>({});

  const abortRef = useRef<AbortController | null>(null);

  // ── Load home chart results for all queries ────────────────────────────────

  const loadHomeResults = useCallback(async (queryList: MonitoringQuery[]) => {
    if (queryList.length === 0) return;
    setLoadingHomeResults(true);
    try {
      const entries = await Promise.all(
        queryList.map(async (q) => {
          try {
            const page = await fetchResults(q.msorId, { size: 60 });
            const sorted = [...page.content].sort(
              (a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime(),
            );
            return [q.msorId, sorted] as const;
          } catch {
            return [q.msorId, [] as MonitoringResult[]] as const;
          }
        }),
      );
      setHomeResults(Object.fromEntries(entries));
    } finally {
      setLoadingHomeResults(false);
    }
  }, []);

  // ── Load all queries ───────────────────────────────────────────────────────

  const loadQueries = useCallback(async () => {
    setLoadingQueries(true);
    setHomeResults({});
    try {
      const data = await fetchQueries();
      setQueries(data);

      // Resolve a query id that was in the URL on initial load
      if (pendingId !== null) {
        const match = data.find((q) => q.msorId === pendingId);
        if (match) {
          setSelectedQuery(match);
          setView("query");
          // Replace so the initial entry has proper state for popstate
          window.history.replaceState({ queryId: match.msorId }, "", `?id=${match.msorId}`);
        } else {
          setView("home");
          window.history.replaceState({}, "", "/");
        }
      }

      // Fetch latest result for each query to show count badges in sidebar
      const latestEntries = await Promise.all(
        data.map(async (q) => {
          try {
            const page = await fetchResults(q.msorId, { size: 1 });
            return [q.msorId, page.content[0] ?? null] as const;
          } catch {
            return [q.msorId, null] as const;
          }
        }),
      );
      setLatestMap(Object.fromEntries(latestEntries));

      void loadHomeResults(data);
    } catch (e) {
      console.error("Failed to load queries", e);
    } finally {
      setLoadingQueries(false);
    }
  }, [loadHomeResults, pendingId]);

  useEffect(() => {
    void loadQueries();
  }, [loadQueries]);

  // ── Load results for selected query (chart) ───────────────────────────────

  useEffect(() => {
    if (!selectedQuery) {
      setAllResults([]);
      setSelectedResult(null);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoadingResults(true);
    setAllResults([]);
    setSelectedResult(null);

    fetchResults(selectedQuery.msorId, { size: 60 })
      .then((page) => {
        const sorted = [...page.content].sort(
          (a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime(),
        );
        setAllResults(sorted);
        if (sorted.length > 0) {
          setSelectedResult(sorted[sorted.length - 1]);
        }
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") console.error(e);
      })
      .finally(() => setLoadingResults(false));
  }, [selectedQuery]);

  // ── Fetch full rows when a bar is clicked ─────────────────────────────────

  const handleBarClick = useCallback(
    async (result: MonitoringResult) => {
      if (!selectedQuery) return;

      if (result.rows?.length > 0 || result.resultCount === 0) {
        setSelectedResult(result);
        return;
      }

      setLoadingRows(true);
      setSelectedResult(result);
      try {
        const page = await fetchResults(selectedQuery.msorId, { date: result.runDate, size: 1 });
        if (page.content.length > 0) setSelectedResult(page.content[0]);
      } catch (e) {
        console.error("Failed to load rows", e);
      } finally {
        setLoadingRows(false);
      }
    },
    [selectedQuery],
  );

  // ── Clear draft edits when the selected result changes ───────────────────

  useEffect(() => {
    setDraftRows({});
  }, [selectedResult?.resultId]);

  // ── Stage a row edit locally (does not call the API) ─────────────────────

  const handleChangeRow = useCallback(
    async (rowId: number, status: RowStatus, comment: string | null) => {
      setDraftRows((prev) => {
        const original = selectedResult?.rows.find((r) => r.rowId === rowId);
        if (!original) return prev;
        if (status === original.rowStatus && comment === original.rowComment) {
          const { [rowId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [rowId]: { rowStatus: status, rowComment: comment } };
      });
    },
    [selectedResult],
  );

  // ── Persist all staged edits to the backend ───────────────────────────────

  const handleSaveChanges = useCallback(async () => {
    if (Object.keys(draftRows).length === 0) return;
    setSavingRows(true);
    try {
      await Promise.all(
        Object.entries(draftRows).map(([rowIdStr, change]) =>
          updateRow(Number(rowIdStr), change.rowStatus, change.rowComment),
        ),
      );
      const snapshot = draftRows;
      const patchRows = (rows: MonitoringResultRow[]) =>
        rows.map((r) => (snapshot[r.rowId] ? { ...r, ...snapshot[r.rowId] } : r));
      setSelectedResult((prev) => (prev ? { ...prev, rows: patchRows(prev.rows) } : prev));
      setAllResults((prev) => prev.map((r) => ({ ...r, rows: patchRows(r.rows ?? []) })));
      setDraftRows({});
    } finally {
      setSavingRows(false);
    }
  }, [draftRows]);

  // ── Trigger on-demand run ─────────────────────────────────────────────────

  const handleRun = async (msorId: number) => {
    setTriggeringId(msorId);
    try {
      await triggerRun(msorId);
    } finally {
      setTriggeringId(null);
    }
  };

  // ── Delete a monitoring query ─────────────────────────────────────────────

  const handleDelete = useCallback(async (query: MonitoringQuery) => {
    setDeletingInProgress(true);
    try {
      await deleteQuery(query.msorId);
      setQueries((qs) => qs.filter((q) => q.msorId !== query.msorId));
      setConfirmDeleteQuery(null);
      if (selectedQuery?.msorId === query.msorId) {
        setView("home");
        window.history.pushState({}, "", "/");
      }
    } finally {
      setDeletingInProgress(false);
    }
  }, [selectedQuery]);

  // ── Toggle a query's checked state ───────────────────────────────────────

  const toggleCheck = useCallback((id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Run selected queries ──────────────────────────────────────────────────

  const handleRunSelected = useCallback(async (ids: number[]) => {
    await Promise.allSettled(ids.map((id) => triggerRun(id)));
    setCheckedIds(new Set());
  }, []);

  // ── Navigate home ─────────────────────────────────────────────────────────

  const goHome = useCallback(() => {
    setView("home");
    window.history.pushState({}, "", "/");
  }, []);

  // ── Navigate to a query's detail view ────────────────────────────────────

  const selectQuery = useCallback((q: MonitoringQuery) => {
    setSelectedQuery(q);
    setView("query");
    window.history.pushState({ queryId: q.msorId }, "", `?id=${q.msorId}`);
  }, []);

  // ── Sync state with browser back/forward ──────────────────────────────────

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const id = (e.state as { queryId?: number } | null)?.queryId;
      if (id != null) {
        const q = queries.find((q) => q.msorId === id);
        if (q) {
          setSelectedQuery(q);
          setView("query");
          return;
        }
      }
      setView("home");
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [queries]);

  // ── Aggregated home chart data (total cases per day across all queries) ─────

  const queryColorMap = useMemo(
    () => Object.fromEntries(
      queries.map((q, idx) => [q.msorId, q.color ?? QUERY_COLORS[idx % QUERY_COLORS.length]])
    ),
    [queries],
  );

  const filteredSidebarQueries = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return queries;
    return queries.filter((query) =>
      query.title.toLowerCase().includes(q) ||
      query.description?.toLowerCase().includes(q) ||
      query.dbType?.toLowerCase().includes(q),
    );
  }, [queries, sidebarSearch]);

  const totalChartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    Object.entries(homeResults).forEach(([msorIdStr, results]) => {
      results.forEach((r) => {
        if (!dateMap.has(r.runDate)) dateMap.set(r.runDate, {});
        const entry = dateMap.get(r.runDate)!;
        entry[msorIdStr] = (entry[msorIdStr] ?? 0) + r.resultCount;
      });
    });
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date: formatDate(date), ...counts }));
  }, [homeResults]);

  // ── Close section menu on outside click ──────────────────────────────────

  useEffect(() => {
    if (!sectionMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (sectionMenuTriggerRef.current && !sectionMenuTriggerRef.current.contains(e.target as Node)) {
        setSectionMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [sectionMenuOpen]);

  // ── Chart data ────────────────────────────────────────────────────────────

  const chartData = allResults.map((r) => ({
    date: formatDate(r.runDate),
    count: r.resultCount,
    result: r,
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r bg-sidebar flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm flex-1">Monitoring Dashboard</span>
          <button
            onClick={() => setDarkMode((d) => !d)}
            className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Home nav item */}
        <div className="px-2 pt-3 pb-1 shrink-0">
          <button
            onClick={goHome}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors cursor-pointer flex items-center gap-2",
              view === "home"
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Home className="h-4 w-4 shrink-0" />
            Home
          </button>
        </div>

        {/* Section label — click label/chevron to collapse/expand; … for actions */}
        <div className="flex items-center px-4 pt-3 pb-1 shrink-0">
          <button
            onClick={() => setItemsOpen((o) => !o)}
            className="flex items-center gap-1 flex-1 cursor-pointer group"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Monitoring Items
            </p>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-muted-foreground transition-transform duration-200",
                !itemsOpen && "-rotate-90",
              )}
            />
          </button>
          <button
            ref={sectionMenuTriggerRef}
            onClick={() => {
              if (!sectionMenuTriggerRef.current) return;
              const rect = sectionMenuTriggerRef.current.getBoundingClientRect();
              setSectionMenuPos({ top: rect.bottom + 4, left: rect.right - 192 });
              setSectionMenuOpen((o) => !o);
            }}
            className={cn(
              "rounded p-0.5 transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent",
              sectionMenuOpen && "bg-accent text-foreground",
            )}
            title="Monitoring items actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>

        {sectionMenuOpen && createPortal(
          <div
            style={{ position: "fixed", top: sectionMenuPos.top, left: sectionMenuPos.left, zIndex: 9999 }}
            className="w-48 rounded-md border bg-background shadow-lg py-0.5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setSectionMenuOpen(false); setCreatingQuery(true); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Create New Item
            </button>
            <button
              onClick={() => { setSectionMenuOpen(false); setRunSelectionOpen(true); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors cursor-pointer rounded-sm"
            >
              <Play className="h-3.5 w-3.5" />
              {checkedIds.size > 0 ? `Run ${checkedIds.size} Selected` : "Run Items"}
            </button>
          </div>,
          document.body,
        )}

        {/* Sidebar search */}
        {itemsOpen && (
          <div className="px-2 pb-1 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-md border border-input bg-background pl-7 pr-7 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              {sidebarSearch && (
                <button
                  onClick={() => setSidebarSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Item list */}
        {itemsOpen && (
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
            {loadingQueries
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-md" />
                ))
              : filteredSidebarQueries.length === 0
                ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">No items match</p>
                )
              : filteredSidebarQueries.map((q) => (
                  <SidebarItem
                    key={q.msorId}
                    query={q}
                    selected={view === "query" && selectedQuery?.msorId === q.msorId}
                    checked={checkedIds.has(q.msorId)}
                    latestResult={latestMap[q.msorId] ?? null}
                    color={queryColorMap[q.msorId] ?? QUERY_COLORS[0]}
                    onClick={() => selectQuery(q)}
                    onToggleCheck={() => toggleCheck(q.msorId)}
                    onRun={() => void handleRun(q.msorId)}
                    onEdit={() => setEditingQueryTarget(q)}
                    onDelete={() => setConfirmDeleteQuery(q)}
                  />
                ))}
          </div>
        )}

        {/* Footer */}
        <div className="border-t px-4 py-3 shrink-0">
          <button
            onClick={loadQueries}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* ── Persistent top bar ────────────────────────────────────────── */}
        <div className="shrink-0 border-b bg-background h-14 flex items-center justify-center px-6">
          <GlobalSearch
            queries={queries}
            queryColorMap={queryColorMap}
            latestMap={latestMap}
            checkedIds={checkedIds}
            onToggleCheck={toggleCheck}
            onSelect={selectQuery}
            onRun={handleRun}
            onEdit={setEditingQueryTarget}
            onDelete={setConfirmDeleteQuery}
          />
        </div>

        {view === "home" ? (
          // ── Home view: grid of query cards ──────────────────────────────
          <div className="flex-1 overflow-y-auto p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold">Overview</h1>
                {!loadingQueries && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {queries.length} monitoring item{queries.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setCreatingQuery(true)}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-accent"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create New
                </button>
                <button
                  onClick={() => setRunSelectionOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-accent"
                >
                  <Play className="h-3.5 w-3.5" />
                  {checkedIds.size > 0 ? `Run ${checkedIds.size} Selected` : "Run Items"}
                </button>
              </div>
            </div>
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Total Cases — All Items</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {loadingHomeResults
                        ? "Loading…"
                        : totalChartData.length > 0
                          ? `${totalChartData.length} day${totalChartData.length !== 1 ? "s" : ""} of data`
                          : "No data yet"}
                    </p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                {loadingQueries || loadingHomeResults ? (
                  <div className="flex h-40 items-end gap-1.5 pb-1">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className="flex-1 rounded-t-sm"
                        style={{ height: `${20 + ((i * 17 + 5) % 65)}%` }}
                      />
                    ))}
                  </div>
                ) : totalChartData.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    No execution history available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={totalChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        content={(props) => (
                          <FollowTooltip
                            {...(props as Parameters<typeof FollowTooltip>[0])}
                            formatValue={(v) => `${v} case${v !== 1 ? "s" : ""}`}
                          />
                        )}
                        cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      />
                      <Legend
                        iconType="square"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      />
                      {queries.map((q) => (
                        <Bar
                          key={q.msorId}
                          dataKey={String(q.msorId)}
                          name={q.title}
                          stackId="a"
                          fill={queryColorMap[q.msorId] ?? QUERY_COLORS[0]}
                          onClick={() => selectQuery(q)}
                          style={{ cursor: "pointer" }}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {loadingQueries || loadingHomeResults
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i}>
                      <CardHeader className="px-4 pt-4 pb-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="mt-2 h-3 w-1/4" />
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>
                  ))
                : queries.map((q) => (
                    <QueryCard
                      key={q.msorId}
                      query={q}
                      results={homeResults[q.msorId] ?? []}
                      color={queryColorMap[q.msorId] ?? QUERY_COLORS[0]}
                      checked={checkedIds.has(q.msorId)}
                      onSelect={() => selectQuery(q)}
                      onToggleCheck={() => toggleCheck(q.msorId)}
                      onRun={() => void handleRun(q.msorId)}
                      onEdit={() => setEditingQueryTarget(q)}
                      onDelete={() => setConfirmDeleteQuery(q)}
                    />
                  ))}
            </div>
          </div>
        ) : !selectedQuery ? (
          // ── Empty state (shouldn't normally show) ───────────────────────
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <Activity className="mb-4 h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">Select a monitoring item</p>
            <p className="mt-1 text-xs">Choose an item from the left sidebar to view results</p>
          </div>
        ) : (
          // ── Query detail view ───────────────────────────────────────────
          <div className="flex flex-col h-full overflow-hidden">
            {/* ── Fixed top: header + chart ──────────────────────────────── */}
            <div className="shrink-0 p-8 pb-6 space-y-6">
              {/* ── Job header ─────────────────────────────────────────── */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goHome}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                      title="Back to overview"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: queryColorMap[selectedQuery.msorId] ?? QUERY_COLORS[0] }}
                    />
                    <h1 className="text-xl font-bold">{selectedQuery.title}</h1>
                    {selectedQuery.activeYn === "N" && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  {selectedQuery.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{selectedQuery.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {selectedQuery.ownerName && (
                      <span>Owner: <span className="text-foreground">{selectedQuery.ownerName}</span></span>
                    )}
                    {selectedQuery.queryInterval && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {selectedQuery.queryInterval}
                      </span>
                    )}
                    {selectedQuery.dbType && (
                      <Badge variant="outline" className="text-[10px]">
                        {selectedQuery.dbType}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditingQueryTarget(selectedQuery)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      "cursor-pointer hover:bg-accent",
                    )}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleRun(selectedQuery.msorId)}
                    disabled={triggeringId === selectedQuery.msorId}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      "cursor-pointer hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {triggeringId === selectedQuery.msorId ? "Running…" : "Run Now"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteQuery(selectedQuery)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium transition-colors",
                      "cursor-pointer text-destructive hover:bg-destructive/10",
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {/* ── Bar chart ──────────────────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Daily Case Count</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {loadingResults
                          ? "Loading execution history…"
                          : chartData.length > 0
                            ? `Last ${chartData.length} run${chartData.length !== 1 ? "s" : ""} — click a bar to view that day's cases`
                            : "No execution history yet"}
                      </p>
                    </div>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingResults ? (
                    <div className="flex h-52 items-end gap-1.5 pb-1">
                      {Array.from({ length: 14 }).map((_, i) => (
                        <Skeleton
                          key={i}
                          className="flex-1 rounded-t-sm"
                          style={{ height: `${20 + ((i * 13 + 7) % 65)}%` }}
                        />
                      ))}
                    </div>
                  ) : chartData.length === 0 ? (
                    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                      No execution history available
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={(props) => (
                            <FollowTooltip
                              {...(props as Parameters<typeof FollowTooltip>[0])}
                              formatValue={(v) => `${v} case${v !== 1 ? "s" : ""}`}
                            />
                          )}
                          cursor={{ fill: "rgba(0,0,0,0.04)" }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[3, 3, 0, 0]}
                          style={{ cursor: "pointer" }}
                          onClick={(payload: { result: MonitoringResult }) =>
                            void handleBarClick(payload.result)
                          }
                        >
                          {chartData.map((entry) => {
                            const qColor = queryColorMap[selectedQuery.msorId] ?? BAR_ACTIVE;
                            return (
                              <Cell
                                key={`cell-${entry.result.resultId}`}
                                fill={
                                  entry.count === 0
                                    ? BAR_ZERO
                                    : entry.result.resultId === selectedResult?.resultId
                                      ? qColor
                                      : `${qColor}66`
                                }
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Scrollable results ──────────────────────────────────── */}
            {selectedResult && (() => {
              const effectiveRows = selectedResult.rows.map((r) => ({
                ...r,
                ...(draftRows[r.rowId] ?? {}),
              }));
              const hasUnsavedChanges = Object.keys(draftRows).length > 0;
              return (
                <div className="flex flex-col flex-1 min-h-0 px-8 pb-8 gap-3">
                  <div className="shrink-0 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-base">
                        {formatFullDate(selectedResult.runDate)}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <StatusBadge status={selectedResult.resultStatus} />
                        <span>
                          <span className="font-medium text-foreground">
                            {selectedResult.resultCount}
                          </span>{" "}
                          {selectedResult.resultCount === 1 ? "case" : "cases"}
                        </span>
                        {selectedResult.executionMs != null && (
                          <span>{selectedResult.executionMs} ms</span>
                        )}
                        {selectedResult.triggeredAlertYn === "Y" && (
                          <Badge variant="warning">Alert sent</Badge>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleSaveChanges()}
                      disabled={!hasUnsavedChanges || savingRows}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                        hasUnsavedChanges && !savingRows
                          ? "cursor-pointer hover:bg-accent"
                          : "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {savingRows ? "Saving…" : "Save Changes"}
                    </button>
                  </div>

                  {selectedResult.resultStatus === "FAIL" && selectedResult.errorMessage && (
                    <ErrorPanel
                      message={selectedResult.errorMessage}
                      detail={selectedResult.errorDetail}
                    />
                  )}

                  <div className="flex-1 min-h-0 overflow-auto rounded-md border">
                    {loadingRows ? (
                      <div className="space-y-2 p-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : (
                      <RowsTable rows={effectiveRows} onUpdateRow={handleChangeRow} />
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {runSelectionOpen && (
        <RunSelectionModal
          queries={queries}
          queryColorMap={queryColorMap}
          initialSelected={checkedIds}
          onClose={() => setRunSelectionOpen(false)}
          onRun={handleRunSelected}
        />
      )}

      {creatingQuery && (
        <CreateQueryModal
          onClose={() => setCreatingQuery(false)}
          onCreated={(created) => {
            setQueries((qs) => [...qs, created]);
            setCreatingQuery(false);
          }}
        />
      )}

      {editingQueryTarget && (
        <EditQueryModal
          query={editingQueryTarget}
          defaultColor={queryColorMap[editingQueryTarget.msorId] ?? QUERY_COLORS[0]}
          onClose={() => setEditingQueryTarget(null)}
          onSaved={(updated) => {
            if (selectedQuery?.msorId === updated.msorId) setSelectedQuery(updated);
            setQueries((qs) => qs.map((q) => (q.msorId === updated.msorId ? updated : q)));
            setEditingQueryTarget(null);
          }}
        />
      )}

      {confirmDeleteQuery && (
        <DeleteConfirmModal
          query={confirmDeleteQuery}
          deleting={deletingInProgress}
          onClose={() => setConfirmDeleteQuery(null)}
          onConfirm={() => void handleDelete(confirmDeleteQuery)}
        />
      )}
    </div>
  );
}
