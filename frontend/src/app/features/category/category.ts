import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { DashboardStore } from '../../core/dashboard-store';
import { CaseDialogsService } from '../modals/case-dialogs.service';
import type { CaseKeySource, MonitoringQuery, RowStatus } from '../../core/models/monitoring';
import { PieChartComponent, type PieSlice } from '../../shared/charts/pie-chart';
import { AllCasesComponent } from '../../shared/grid/all-cases';
import { QUERY_COLORS, ROW_STATUS_COLORS } from '../../shared/constants';
import { CARD_DIRECTIVES } from '../../shared/ui/card';
import { VerticalResizableComponent } from '../../shared/ui/vertical-resizable';
import { InfoPopoverComponent } from '../../shared/overlays/info-popover';
import { categoryColor, categoryDescription } from '../../shared/utils/category';
import { buildCaseAgeData, caseAgeSubtitle } from '../../shared/utils/case-age';
import { nyToday } from '../../shared/utils/ny-date';

/**
 * Homepage-style layout (header + two pies) scoped to one category, with the All Cases
 * table locked to that category below.
 */
@Component({
  selector: 'app-category',
  imports: [VerticalResizableComponent, InfoPopoverComponent, PieChartComponent, AllCasesComponent, NgIcon, ...CARD_DIRECTIVES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The split fills the routed outlet; the host has to be a full-height flex box
  // or VerticalResizable's flex-1 panes have nothing to divide.
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
  `,
  templateUrl: './category.html',
})
export class CategoryComponent {
  protected readonly store = inject(DashboardStore);
  private readonly caseDialogs = inject(CaseDialogsService);
  private readonly router = inject(Router);

  /** Bound from the `:name` route param by `withComponentInputBinding()`. */
  readonly name = input.required<string>();

  protected readonly description = computed(() => categoryDescription(this.name()));
  protected readonly color = computed(() => categoryColor(this.name()));

  protected readonly items = computed(() =>
    this.store.queries().filter((q) => (q.category ?? 'Other') === this.name()),
  );

  /** Latest-run rows for this category's active items. */
  private readonly latestRows = computed(() => {
    const results = this.store.homeResults();
    const rows: {
      msorId: number;
      caseKey: string;
      caseKeySource: CaseKeySource | null;
      rowStatus: RowStatus;
    }[] = [];
    for (const q of this.items()) {
      if (q.activeYn !== 'Y') continue;
      const runs = results[q.msorId] ?? [];
      const latest = runs[runs.length - 1];
      for (const row of latest?.rows ?? []) {
        rows.push({
          msorId: q.msorId,
          caseKey: row.caseKey,
          caseKeySource: row.caseKeySource,
          rowStatus: row.rowStatus,
        });
      }
    }
    return rows;
  });

  /** Open cases per item in this category — the drill-into-item pie. */
  protected readonly byItemSlices = computed<PieSlice[]>(() => {
    const counts = new Map<number, number>();
    for (const r of this.latestRows()) {
      if (r.rowStatus === 'DONE') continue;
      counts.set(r.msorId, (counts.get(r.msorId) ?? 0) + 1);
    }
    const all = this.store.queries();
    return this.items()
      .map((q) => ({
        name: q.title,
        value: counts.get(q.msorId) ?? 0,
        color: q.color ?? QUERY_COLORS[all.indexOf(q) % QUERY_COLORS.length],
        msorId: q.msorId,
      }))
      .filter((s) => s.value > 0);
  });

  protected readonly statusSlices = computed<PieSlice[]>(() => {
    const counts: Record<RowStatus, number> = { OPEN: 0, IN_PROGRESS: 0, DONE: 0 };
    for (const r of this.latestRows()) counts[r.rowStatus]++;
    return (
      [
        { name: 'Open', value: counts.OPEN, color: ROW_STATUS_COLORS.OPEN },
        { name: 'In Progress', value: counts.IN_PROGRESS, color: ROW_STATUS_COLORS.IN_PROGRESS },
        { name: 'Done', value: counts.DONE, color: ROW_STATUS_COLORS.DONE },
      ] satisfies PieSlice[]
    ).filter((s) => s.value > 0);
  });

  private readonly caseAge = computed(() =>
    buildCaseAgeData(this.latestRows(), this.store.firstSeenByKey(), nyToday()),
  );

  protected readonly caseAgeSlices = computed(() => this.caseAge().slices);
  protected readonly caseAgeSubtitle = computed(() => caseAgeSubtitle(this.caseAge()));

  protected onSliceItem(slice: PieSlice): void {
    if (slice.msorId != null) void this.router.navigate(['/query', slice.msorId]);
  }

  protected onSelectQuery(q: MonitoringQuery): void {
    void this.router.navigate(['/query', q.msorId]);
  }

  protected onSelectCategory(cat: string): void {
    void this.router.navigate(['/category', cat]);
  }

  protected onRowsSaved(): void {
    void this.store.loadCaseRows();
    void this.store.loadHomeResults(this.store.queries());
  }

  protected openActivity(e: { msorId: number; caseKey: string; caseLabel: string }): void {
    this.caseDialogs.openCaseActivity(e);
  }
}
