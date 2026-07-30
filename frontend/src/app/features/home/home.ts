import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DashboardStore } from '../../core/dashboard-store';
import { CaseDialogsService } from '../modals/case-dialogs.service';
import type { MonitoringQuery } from '../../core/models/monitoring';
import { PieChartComponent, type PieSlice } from '../../shared/charts/pie-chart';
import { AllCasesComponent } from '../../shared/grid/all-cases';
import { NgIcon } from '@ng-icons/core';
import { CARD_DIRECTIVES } from '../../shared/ui/card';
import { BadgeDirective } from '../../shared/ui/badge';
import { SkeletonDirective } from '../../shared/ui/skeleton';
import { ROW_STATUS_COLORS } from '../../shared/constants';
import { categoryColor } from '../../shared/utils/category';
import {
  buildCaseAgeData,
  caseAgeSubtitle,
  isAgeable,
  caseAgeBucket,
} from '../../shared/utils/case-age';
import { nyToday } from '../../shared/utils/ny-date';
import type { CaseKeySource, RowStatus } from '../../core/models/monitoring';

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
  imports: [
    RouterLink,
    PieChartComponent,
    AllCasesComponent,
    NgIcon,
    BadgeDirective,
    SkeletonDirective,
    ...CARD_DIRECTIVES,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class HomeComponent {
  protected readonly store = inject(DashboardStore);
  private readonly caseDialogs = inject(CaseDialogsService);
  protected readonly description = HOME_DESCRIPTION;
  protected readonly skeletonRows = Array.from({ length: 6 });

  /**
   * The rows of each active item's latest run — the same population the case counts and
   * status pie read, so the age pie reconciles with both by construction.
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

  protected readonly totalCases = computed(
    () => this.latestRows().filter((r) => r.rowStatus !== 'DONE').length,
  );

  /**
   * "New today" is the Today bucket minus cases already resolved: the badge answers
   * "what landed on me today", the pie answers "how old is this backlog". The two are
   * deliberately different numbers.
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

  protected readonly caseAge = computed(() =>
    buildCaseAgeData(this.latestRows(), this.store.firstSeenByKey(), nyToday()),
  );

  protected readonly caseAgeSlices = computed<PieSlice[]>(() => this.caseAge().slices);
  protected readonly caseAgeSubtitle = computed(() => caseAgeSubtitle(this.caseAge()));

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

  /** Open-case count per item, from its latest run. */
  protected readonly openByQuery = computed(() => {
    const map = new Map<number, number>();
    for (const row of this.latestRows()) {
      if (row.rowStatus === 'DONE') continue;
      map.set(row.msorId, (map.get(row.msorId) ?? 0) + 1);
    }
    return map;
  });

  protected categoryColor(cat: string): string {
    return categoryColor(cat);
  }

  private readonly router = inject(Router);

  protected onSelectQuery(q: MonitoringQuery): void {
    void this.router.navigate(['/query', q.msorId]);
  }

  protected onSelectCategory(cat: string): void {
    void this.router.navigate(['/category', cat]);
  }

  /** A save changes case statuses, which both pies derive from. */
  protected onRowsSaved(): void {
    void this.store.loadCaseRows();
    void this.store.loadHomeResults(this.store.queries());
  }

  protected openActivity(e: { msorId: number; caseKey: string; caseLabel: string }): void {
    this.caseDialogs.openCaseActivity(e);
  }
}
