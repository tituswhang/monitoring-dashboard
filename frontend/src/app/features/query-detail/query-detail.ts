import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { DashboardStore } from '../../core/dashboard-store';
import { MonitoringService } from '../../core/monitoring.service';
import type {
  MonitoringQuery,
  MonitoringResult,
  MonitoringResultRow,
  RowStatus,
} from '../../core/models/monitoring';
import { PieChartComponent, type PieSlice } from '../../shared/charts/pie-chart';
import { RowsTableComponent, type BulkRowChange } from '../../shared/grid/rows-table';
import { QUERY_COLORS, ROW_STATUS_COLORS } from '../../shared/constants';
import { BadgeDirective } from '../../shared/ui/badge';
import { CARD_DIRECTIVES } from '../../shared/ui/card';
import { ErrorPanelComponent, RunErrorComponent } from '../../shared/ui/error-panel';
import { SkeletonDirective } from '../../shared/ui/skeleton';
import { buildCaseAgeData, caseAgeSubtitle } from '../../shared/utils/case-age';
import { pluralS } from '../../shared/utils/plural';
import {
  defaultScanWindow,
  formatDate,
  formatFullDate,
  formatScanRange,
  type ScanWindow,
} from '../../shared/utils/scan-window';
import { nyToday } from '../../shared/utils/ny-date';
import { DialogService } from '../../shared/overlays/dialog.service';
import { CaseDialogsService } from '../modals/case-dialogs.service';
import { DeleteConfirmDialogComponent } from '../modals/delete-confirm-dialog';
import {
  QueryFormDialogComponent,
  type QueryFormDialogData,
} from '../modals/query-form-dialog';
import {
  QueryHistoryDialogComponent,
  type QueryHistoryDialogData,
} from '../modals/query-history-dialog';
import { RunScanControlComponent } from './run-scan-control';

@Component({
  selector: 'app-query-detail',
  imports: [
    RowsTableComponent,
    PieChartComponent,
    RunScanControlComponent,
    ErrorPanelComponent,
    RunErrorComponent,
    NgIcon,
    BadgeDirective,
    SkeletonDirective,
    ...CARD_DIRECTIVES,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
  templateUrl: './query-detail.html',
})
export class QueryDetailComponent {
  protected readonly store = inject(DashboardStore);
  private readonly api = inject(MonitoringService);
  private readonly router = inject(Router);
  private readonly dialogs = inject(DialogService);
  private readonly caseDialogs = inject(CaseDialogsService);

  /** Existing categories, so the edit form can offer them without forcing a choice. */
  protected readonly categoryOptions = computed(() =>
    [...new Set(this.store.queries().map((q) => q.category).filter(Boolean))].sort(),
  );

  /** Bound from the `:id` route param by `withComponentInputBinding()`. */
  readonly id = input.required({ transform: numberAttribute });

  protected readonly query = computed(() =>
    this.store.queries().find((q) => q.msorId === this.id()),
  );

  protected readonly allResults = signal<MonitoringResult[]>([]);
  protected readonly selectedResult = signal<MonitoringResult | null>(null);
  protected readonly loadingResults = signal(false);
  protected readonly triggering = signal(false);
  protected readonly runError = signal<string | null>(null);

  /**
   * Held for the session and shared across items, so an operator investigating a date
   * range does not re-enter it for every item they look at. Never persisted: a range that
   * outlived the tab would silently narrow tomorrow's runs.
   */
  protected readonly scanWindow = signal<ScanWindow>(defaultScanWindow());

  protected readonly draftRows = signal<
    Record<number, { rowStatus: RowStatus; rowComment: string | null }>
  >({});
  protected readonly savingRows = signal(false);
  protected readonly draftCount = computed(() => Object.keys(this.draftRows()).length);

  protected readonly color = computed(() => {
    const all = this.store.queries();
    const idx = all.findIndex((q) => q.msorId === this.id());
    return this.query()?.color ?? QUERY_COLORS[(idx < 0 ? 0 : idx) % QUERY_COLORS.length];
  });

  /** Run dates that actually exist, for the run-date selector. */
  protected readonly availableDates = computed(() =>
    [...new Set(this.allResults().map((r) => r.runDate))].sort((a, b) => b.localeCompare(a)),
  );

  /** The grid renders staged values, so an edit is visible before it is saved. */
  protected readonly displayRows = computed<MonitoringResultRow[]>(() => {
    const result = this.selectedResult();
    if (!result) return [];
    const drafts = this.draftRows();
    return result.rows.map((r) => (drafts[r.rowId] ? { ...r, ...drafts[r.rowId] } : r));
  });

  protected readonly statusSlices = computed<PieSlice[]>(() => {
    const counts: Record<RowStatus, number> = { OPEN: 0, IN_PROGRESS: 0, DONE: 0 };
    for (const row of this.displayRows()) counts[row.rowStatus]++;
    return (
      [
        { name: 'Open', value: counts.OPEN, color: ROW_STATUS_COLORS.OPEN },
        { name: 'In Progress', value: counts.IN_PROGRESS, color: ROW_STATUS_COLORS.IN_PROGRESS },
        { name: 'Done', value: counts.DONE, color: ROW_STATUS_COLORS.DONE },
      ] satisfies PieSlice[]
    ).filter((s) => s.value > 0);
  });

  private readonly caseAge = computed(() =>
    buildCaseAgeData(
      this.displayRows().map((r) => ({
        msorId: this.id(),
        caseKey: r.caseKey,
        caseKeySource: r.caseKeySource,
      })),
      this.store.firstSeenByKey(),
      nyToday(),
    ),
  );

  protected readonly caseAgeSlices = computed(() => this.caseAge().slices);
  protected readonly caseAgeSubtitle = computed(() => caseAgeSubtitle(this.caseAge()));

  /**
   * The range a recorded run actually scanned. Without it a bare "0 cases" is ambiguous —
   * it could mean nothing is broken, or that nothing broke in those seven days — and a
   * widened scan's count looks like a spike next to the daily runs around it.
   */
  protected readonly scanRangeNote = computed(() => {
    const r = this.selectedResult();
    if (!r) return null;
    if (r.pastUnresolvedYn === 'Y') return ' · includes past unresolved cases';
    if (!r.beginDate || !r.endDate) return null;
    return ` · scanned ${formatScanRange(r.beginDate, r.endDate)}`;
  });

  protected readonly statusSubtitle = computed(() => {
    if (this.loadingResults()) return 'Loading…';
    const r = this.selectedResult();
    if (!r) return 'No data';
    return `${r.resultCount} case${pluralS(r.resultCount)} on ${formatDate(r.runDate)}`;
  });

  /**
   * Now that Done cases are withheld from later runs, a run with zero cases means one of
   * two opposite things — the team is caught up, or the condition cleared — and the
   * operator has to be able to tell which.
   */
  protected readonly emptyCasesText = computed(() => {
    const r = this.selectedResult();
    if (r?.resultCount !== 0) return 'No row data loaded';
    const done = r.suppressedCount ?? 0;
    return done > 0
      ? `All ${done} case${pluralS(done)} for this date are done`
      : 'No cases for this date';
  });

  constructor() {
    effect(() => {
      const msorId = this.id();
      this.loadingResults.set(true);
      this.selectedResult.set(null);
      this.allResults.set([]);
      this.draftRows.set({});
      // A failed-run message belongs to the item it was raised on.
      this.runError.set(null);
      this.api
        .fetchResults(msorId, { size: 60 })
        .then((page) => {
          const sorted = [...page.content].sort(
            (a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime(),
          );
          this.allResults.set(sorted);
          this.selectedResult.set(sorted.length > 0 ? sorted[sorted.length - 1] : null);
        })
        .catch((e) => console.error('Failed to load results', e))
        .finally(() => this.loadingResults.set(false));
    });
  }

  protected fullDate(iso: string): string {
    return formatFullDate(iso);
  }

  protected selectDate(runDate: string): void {
    const match = this.allResults().find((r) => r.runDate === runDate);
    if (match) {
      this.selectedResult.set(match);
      this.draftRows.set({});
    }
  }

  protected onDateChange(event: Event): void {
    this.selectDate((event.target as HTMLSelectElement).value);
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected async run(): Promise<void> {
    const q = this.query();
    if (!q) return;
    this.triggering.set(true);
    this.runError.set(null);
    try {
      // Items still carrying a literal date floor ignore the window entirely.
      await this.api.triggerRun(q.msorId, q.dateRangeSupported ? this.scanWindow() : undefined);
      const page = await this.api.fetchResults(q.msorId, { size: 60 });
      const sorted = [...page.content].sort(
        (a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime(),
      );
      this.allResults.set(sorted);
      this.selectedResult.set(sorted.length > 0 ? sorted[sorted.length - 1] : null);
      void this.store.loadCaseRows();
    } catch (e) {
      this.runError.set(e instanceof Error ? e.message : 'Run failed');
    } finally {
      this.triggering.set(false);
    }
  }

  /** Staging an edit that matches the row's saved value drops the draft entirely. */
  protected onUpdateRow(e: { rowId: number; status: RowStatus; comment: string | null }): void {
    this.draftRows.update((prev) => {
      const original = this.selectedResult()?.rows.find((r) => r.rowId === e.rowId);
      if (!original) return prev;
      if (e.status === original.rowStatus && e.comment === original.rowComment) {
        const { [e.rowId]: _dropped, ...rest } = prev;
        return rest;
      }
      return { ...prev, [e.rowId]: { rowStatus: e.status, rowComment: e.comment } };
    });
  }

  /**
   * For fields a bulk action leaves untouched, the row keeps its current value —
   * including any unsaved staged draft.
   */
  protected onBulkUpdate(e: { rowIds: number[]; changes: BulkRowChange }): void {
    this.draftRows.update((prev) => {
      const byId = new Map((this.selectedResult()?.rows ?? []).map((r) => [r.rowId, r]));
      const next = { ...prev };
      for (const rowId of e.rowIds) {
        const original = byId.get(rowId);
        if (!original) continue;
        const current = next[rowId] ?? {
          rowStatus: original.rowStatus,
          rowComment: original.rowComment,
        };
        const merged = {
          rowStatus: e.changes.status ?? current.rowStatus,
          rowComment: e.changes.comment !== undefined ? e.changes.comment : current.rowComment,
        };
        if (merged.rowStatus === original.rowStatus && merged.rowComment === original.rowComment) {
          delete next[rowId];
        } else {
          next[rowId] = merged;
        }
      }
      return next;
    });
  }

  protected async save(): Promise<void> {
    const drafts = this.draftRows();
    if (Object.keys(drafts).length === 0) return;
    this.savingRows.set(true);
    try {
      await Promise.all(
        Object.entries(drafts).map(([rowId, change]) =>
          this.api.updateRow(Number(rowId), change.rowStatus, change.rowComment),
        ),
      );
      const patch = (rows: MonitoringResultRow[]) =>
        rows.map((r) => (drafts[r.rowId] ? { ...r, ...drafts[r.rowId] } : r));
      this.selectedResult.update((prev) => (prev ? { ...prev, rows: patch(prev.rows) } : prev));
      this.allResults.update((prev) => prev.map((r) => ({ ...r, rows: patch(r.rows ?? []) })));
      this.draftRows.set({});
      void this.store.loadCaseRows();
    } finally {
      this.savingRows.set(false);
    }
  }

  protected openEdit(): void {
    const q = this.query();
    if (!q) return;
    const ref = this.dialogs.open<QueryFormDialogComponent, QueryFormDialogData, MonitoringQuery>(
      QueryFormDialogComponent,
      {
        width: '42rem',
        maxWidth: '95vw',
        data: { query: q, categoryOptions: this.categoryOptions(), defaultColor: this.color() },
      },
    );
    ref.afterClosed().subscribe((updated) => {
      if (updated) void this.store.loadQueries();
    });
  }

  protected openHistory(): void {
    const q = this.query();
    if (!q) return;
    this.dialogs.open<QueryHistoryDialogComponent, QueryHistoryDialogData, void>(
      QueryHistoryDialogComponent,
      { width: '42rem', maxWidth: '95vw', data: { query: q, results: this.allResults() } },
    );
  }

  protected openDelete(): void {
    const q = this.query();
    if (!q) return;
    const ref = this.dialogs.open<DeleteConfirmDialogComponent, MonitoringQuery, boolean>(
      DeleteConfirmDialogComponent,
      { width: '26rem', maxWidth: '95vw', data: q },
    );
    ref.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      await this.api.deleteQuery(q.msorId);
      await this.store.loadQueries();
      void this.router.navigate(['/']);
    });
  }

  protected openActivity(e: { msorId: number; caseKey: string; caseLabel: string }): void {
    this.caseDialogs.openCaseActivity(e);
  }
}
