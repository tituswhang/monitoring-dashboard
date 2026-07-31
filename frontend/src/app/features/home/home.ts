import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { DashboardStore } from '../../core/dashboard-store';
import { CaseDialogsService } from '../modals/case-dialogs.service';
import type { CaseKeySource, MonitoringQuery, RowStatus } from '../../core/models/monitoring';
import { PieChartComponent, type PieSlice } from '../../shared/charts/pie-chart';
import { AllCasesComponent } from '../../shared/grid/all-cases';
import { CARD_DIRECTIVES } from '../../shared/ui/card';
import { VerticalResizableComponent } from '../../shared/ui/vertical-resizable';
import { InfoPopoverComponent } from '../../shared/overlays/info-popover';
import { SkeletonDirective } from '../../shared/ui/skeleton';
import { CATEGORY_FALLBACK, ROW_STATUS_COLORS } from '../../shared/constants';
import { categoryColor, categoryRank } from '../../shared/utils/category';
import {
  buildCaseAgeData,
  caseAgeBucket,
  caseAgeSubtitle,
  isAgeable,
} from '../../shared/utils/case-age';
import { nyToday } from '../../shared/utils/ny-date';
import { pluralS } from '../../shared/utils/plural';

/** Static landing-page copy. TODO(copy): placeholder text — replace when supplied. */
const HOME_DESCRIPTION =
  'Overview of all monitoring items across every category. Each item runs a query on a schedule ' +
  'and surfaces open cases that need attention.';

interface LatestRow {
  msorId: number;
  caseKey: string;
  caseKeySource: CaseKeySource | null;
  rowStatus: RowStatus;
}

@Component({
  selector: 'app-home',
  imports: [VerticalResizableComponent, InfoPopoverComponent, PieChartComponent, AllCasesComponent, NgIcon, SkeletonDirective, ...CARD_DIRECTIVES],
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
  templateUrl: './home.html',
})
export class HomeComponent {
  protected readonly store = inject(DashboardStore);
  private readonly caseDialogs = inject(CaseDialogsService);
  private readonly router = inject(Router);

  protected readonly description = HOME_DESCRIPTION;

  /**
   * Open cases per **category**, from each active item's latest run.
   *
   * Reads `latestMap` rather than the row-level data: this is the headline count the page
   * advertises. Wedges are click targets — this is the main way into a category page.
   */
  protected readonly categorySlices = computed<PieSlice[]>(() => {
    const latest = this.store.latestMap();
    const byCat = new Map<string, number>();
    for (const q of this.store.activeQueries()) {
      const count = latest[q.msorId]?.resultCount ?? 0;
      if (count <= 0) continue;
      const cat = q.category ?? CATEGORY_FALLBACK;
      byCat.set(cat, (byCat.get(cat) ?? 0) + count);
    }
    return [...byCat.entries()]
      .map(([category, value]) => ({ name: category, value, color: categoryColor(category) }))
      .sort((a, b) => b.value - a.value || categoryRank(a.name) - categoryRank(b.name));
  });

  protected readonly totalCaseCount = computed(() =>
    this.categorySlices().reduce((n, s) => n + s.value, 0),
  );

  protected readonly categorySubtitle = computed(() => {
    const slices = this.categorySlices();
    if (slices.length === 0) return 'No open cases';
    const total = this.totalCaseCount();
    const noun = slices.length === 1 ? 'category' : 'categories';
    return `${total} open case${pluralS(total)} across ${slices.length} ${noun}`;
  });

  /**
   * The rows of each active item's latest run — the same population the status and age
   * pies count, so they reconcile with each other by construction.
   */
  private readonly latestRows = computed<LatestRow[]>(() => {
    const results = this.store.homeResults();
    const rows: LatestRow[] = [];
    for (const q of this.store.activeQueries()) {
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

  protected readonly statusSlices = computed<PieSlice[]>(() => {
    const counts: Record<RowStatus, number> = { OPEN: 0, IN_PROGRESS: 0, DONE: 0 };
    for (const row of this.latestRows()) counts[row.rowStatus]++;
    return (
      [
        { name: 'Open', value: counts.OPEN, color: ROW_STATUS_COLORS.OPEN },
        { name: 'In Progress', value: counts.IN_PROGRESS, color: ROW_STATUS_COLORS.IN_PROGRESS },
        { name: 'Done', value: counts.DONE, color: ROW_STATUS_COLORS.DONE },
      ] satisfies PieSlice[]
    ).filter((s) => s.value > 0);
  });

  protected readonly statusTotal = computed(() => this.latestRows().length);

  protected readonly statusSubtitle = computed(() => {
    const total = this.statusTotal();
    return total > 0 ? `${total} case${pluralS(total)} by status` : 'No cases';
  });

  /**
   * "New today" counts new *and unresolved* cases, so it reads lower than the age pie's
   * Today wedge whenever something was opened and closed the same day. The tooltip
   * explains the gap rather than leaving it looking like a bug.
   */
  protected readonly newToday = computed(() => {
    const today = nyToday();
    const firstSeen = this.store.firstSeenByKey();
    const rows = this.latestRows().filter((r) => {
      if (!isAgeable(r)) return false;
      const seen = firstSeen.get(`${r.msorId}:${r.caseKey}`);
      // caseAgeBucket, not `seen === today` — both must agree on a future first_date.
      return seen != null && caseAgeBucket(seen, today) === 0;
    });
    return {
      count: rows.filter((r) => r.rowStatus !== 'DONE').length,
      resolved: rows.filter((r) => r.rowStatus === 'DONE').length,
    };
  });

  protected readonly newTodayTitle = computed(() => {
    const { count, resolved } = this.newToday();
    return resolved > 0
      ? `${count} new today · ${resolved} already resolved`
      : `${count} case${pluralS(count)} first seen today`;
  });

  private readonly caseAge = computed(() =>
    buildCaseAgeData(this.latestRows(), this.store.firstSeenByKey(), nyToday()),
  );

  protected readonly caseAgeSlices = computed<PieSlice[]>(() => this.caseAge().slices);
  protected readonly caseAgeSubtitle = computed(() => caseAgeSubtitle(this.caseAge()));

  protected itemCountLabel(): string {
    const n = this.store.queries().length;
    return `${n} monitoring item${pluralS(n)}`;
  }

  protected caseCountLabel(): string {
    const n = this.totalCaseCount();
    return `${n} total case${pluralS(n)}`;
  }

  protected onSelectQuery(q: MonitoringQuery): void {
    void this.router.navigate(['/query', q.msorId]);
  }

  protected onSelectCategory(cat: string): void {
    void this.router.navigate(['/category', cat]);
  }

  /** A save changes case statuses, which every pie derives from. */
  protected onRowsSaved(): void {
    void this.store.loadCaseRows();
    void this.store.loadHomeResults(this.store.queries());
  }

  protected openActivity(e: { msorId: number; caseKey: string; caseLabel: string }): void {
    this.caseDialogs.openCaseActivity(e);
  }
}
