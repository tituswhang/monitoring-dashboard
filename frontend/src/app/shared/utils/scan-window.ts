import { format, parseISO, subDays } from 'date-fns';
import { nyToday } from './ny-date';

// ── Scan range ────────────────────────────────────────────────────────────────
//
// The date range a run asks the *target* database for — `so.created_at` on DATABASE1,
// `transfer_date` on DATABASE3. This is NOT the All Cases from/to filter: that one narrows
// rows already collected, by the date each case was first seen. The two are independent, and
// a case created on the 3rd can be recorded by a run on the 22nd, so it can sit inside one
// range and outside the other. They are deliberately worded and placed differently, and
// must never be wired together — syncing them would hide rows a run had just produced.

/** Days the default scan range covers, matching the server's own default lookback. */
export const DEFAULT_LOOKBACK_DAYS = 7;

export interface ScanWindow {
  /** Inclusive, `yyyy-MM-dd`. Ignored while `includePastUnresolved` is set. */
  beginDate: string;
  /** Inclusive, `yyyy-MM-dd`. */
  endDate: string;
  includePastUnresolved: boolean;
}

/** The last week through today, in the application's zone. Recomputed per call, never cached. */
export function defaultScanWindow(): ScanWindow {
  const today = nyToday();
  return {
    beginDate: format(subDays(parseISO(today), DEFAULT_LOOKBACK_DAYS), 'yyyy-MM-dd'),
    endDate: today,
    includePastUnresolved: false,
  };
}

export function isDefaultScanWindow(w: ScanWindow): boolean {
  const d = defaultScanWindow();
  return !w.includePastUnresolved && w.beginDate === d.beginDate && w.endDate === d.endDate;
}

/** `2026-07-15`, `2026-07-22` → `Jul 15 – Jul 22`. */
export function formatScanRange(beginDate: string, endDate: string): string {
  try {
    return `${format(parseISO(beginDate), 'MMM d')} – ${format(parseISO(endDate), 'MMM d')}`;
  } catch {
    return `${beginDate} – ${endDate}`;
  }
}

/**
 * A row cap breached by a widened scan is not the same failure as a runaway query, and the
 * generic "narrow the query, or raise max-rows" text sends the operator to the wrong place:
 * the query is fine, the range is simply too wide. Only reworded when the run actually was
 * a widened scan — the same message from a daily run still means what it says.
 */
export function tooLargeHint(message: string, pastUnresolved: boolean): string | null {
  if (!pastUnresolved || !message.includes('configured maximum')) return null;
  return (
    'Too many unresolved cases to list. Narrow the date range, or work through the ' +
    'current backlog before widening the scan again.'
  );
}

export function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d');
  } catch {
    return iso;
  }
}

export function formatFullDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMMM d, yyyy');
  } catch {
    return iso;
  }
}
