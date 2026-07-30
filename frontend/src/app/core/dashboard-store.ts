import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  AllCasesRow,
  CaseWorkloadResponse,
  MonitoringQuery,
  MonitoringResult,
} from './models/monitoring';
import { MonitoringService } from './monitoring.service';
import { nyMonth } from '../shared/utils/ny-date';

/**
 * The data the whole dashboard reads.
 *
 * In React all of this lived as ~30 `useState`s inside `DashboardPage`, which every view
 * was a child of. The views are now sibling routes, so the state has to outlive any one
 * of them — hence a root-provided store rather than component state. The loaders below
 * are ports of the `useCallback`s from `DashboardPage.tsx:5012–5110`.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly api = inject(MonitoringService);

  // ── Monitoring items ───────────────────────────────────────────────────────
  readonly queries = signal<MonitoringQuery[]>([]);
  readonly loadingQueries = signal(true);

  /** Newest run per item, keyed by msorId. `null` when an item has never run. */
  readonly latestMap = signal<Record<number, MonitoringResult | null>>({});

  /** Up to 60 runs per item, oldest-first — what the home sparklines and pies read. */
  readonly homeResults = signal<Record<number, MonitoringResult[]>>({});

  // ── Cases ──────────────────────────────────────────────────────────────────
  readonly caseRows = signal<AllCasesRow[]>([]);
  readonly loadingCaseRows = signal(true);

  // ── KPI workload ───────────────────────────────────────────────────────────
  readonly workload = signal<CaseWorkloadResponse | null>(null);
  readonly loadingWorkload = signal(false);
  readonly workloadError = signal<string | null>(null);

  readonly activeQueries = computed(() => this.queries().filter((q) => q.activeYn === 'Y'));

  /**
   * First-seen date per case, keyed `${msorId}:${caseKey}`.
   *
   * The rows each page renders carry no date at all, and `homeResults` holds only a
   * 60-run window — a case whose first sighting predates that window would be dated to
   * the window edge and reported as new. Only the server's MIN(run_date), which
   * `fetchAllResultRows` returns as `runDate`, is trustworthy.
   */
  readonly firstSeenByKey = computed(() => {
    const map = new Map<string, string>();
    for (const row of this.caseRows()) map.set(`${row.msorId}:${row.caseKey}`, row.runDate);
    return map;
  });

  async loadQueries(): Promise<MonitoringQuery[]> {
    this.loadingQueries.set(true);
    this.homeResults.set({});
    try {
      const data = await this.api.fetchQueries();
      this.queries.set(data);

      const latestEntries = await Promise.all(
        data.map(async (q) => {
          try {
            const page = await this.api.fetchResults(q.msorId, { size: 1 });
            return [q.msorId, page.content[0] ?? null] as const;
          } catch {
            return [q.msorId, null] as const;
          }
        }),
      );
      this.latestMap.set(Object.fromEntries(latestEntries));

      void this.loadHomeResults(data);
      void this.loadCaseRows();
      return data;
    } catch (e) {
      console.error('Failed to load queries', e);
      return [];
    } finally {
      this.loadingQueries.set(false);
    }
  }

  async loadHomeResults(queryList: MonitoringQuery[]): Promise<void> {
    if (queryList.length === 0) return;
    const entries = await Promise.all(
      queryList.map(async (q) => {
        try {
          const page = await this.api.fetchResults(q.msorId, { size: 60 });
          const sorted = [...page.content].sort(
            (a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime(),
          );
          return [q.msorId, sorted] as const;
        } catch {
          return [q.msorId, [] as MonitoringResult[]] as const;
        }
      }),
    );
    this.homeResults.set(Object.fromEntries(entries));
  }

  async loadCaseRows(): Promise<void> {
    this.loadingCaseRows.set(true);
    try {
      this.caseRows.set(await this.api.fetchAllResultRows());
    } catch (e) {
      console.error('Failed to load case first-seen dates', e);
    } finally {
      this.loadingCaseRows.set(false);
    }
  }

  async loadWorkload(month: string): Promise<void> {
    this.loadingWorkload.set(true);
    this.workloadError.set(null);
    try {
      this.workload.set(await this.api.fetchCaseWorkload(month));
    } catch (e) {
      console.error('Failed to load case workload', e);
      this.workloadError.set(e instanceof Error ? e.message : 'Unknown error');
      this.workload.set(null);
    } finally {
      this.loadingWorkload.set(false);
    }
  }

  /**
   * Refresh after a write. The two halves of a pie come from two places, and only one of
   * them can have changed:
   *
   * - **Statuses** come from `caseRows`, so refreshing those updates every month's wedges,
   *   past ones included (a July case you finish today turns green in July's pie).
   * - **Case membership** comes from the workload call, and a new touch can only ever land
   *   in the *current* month. Viewing a past month, that response cannot have changed —
   *   refetching it would be pure waste.
   */
  refreshAfterRowWrite(viewedMonth: string): void {
    void this.loadCaseRows();
    if (viewedMonth === nyMonth()) void this.loadWorkload(viewedMonth);
  }
}
