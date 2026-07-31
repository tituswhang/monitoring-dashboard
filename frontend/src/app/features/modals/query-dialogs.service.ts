import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DashboardStore } from '../../core/dashboard-store';
import { MonitoringService } from '../../core/monitoring.service';
import type { MonitoringQuery, MonitoringResult } from '../../core/models/monitoring';
import { QUERY_COLORS } from '../../shared/constants';
import { DialogService } from '../../shared/overlays/dialog.service';
import { DeleteConfirmDialogComponent } from './delete-confirm-dialog';
import { QueryFormDialogComponent, type QueryFormDialogData } from './query-form-dialog';
import {
  QueryHistoryDialogComponent,
  type QueryHistoryDialogData,
} from './query-history-dialog';

/**
 * Per-item actions — edit, history, delete, run, on-hold.
 *
 * Shared because the same six actions are reachable from two places: the sidebar item's
 * ⋯ menu and the query detail toolbar. In the React source both call sites reached into
 * DashboardPage's own handlers; here they share this instead.
 */
@Injectable({ providedIn: 'root' })
export class QueryDialogsService {
  private readonly dialogs = inject(DialogService);
  private readonly api = inject(MonitoringService);
  private readonly store = inject(DashboardStore);
  private readonly router = inject(Router);

  private categoryOptions(): string[] {
    return [...new Set(this.store.queries().map((q) => q.category).filter(Boolean))].sort();
  }

  private colorOf(query: MonitoringQuery): string {
    const idx = this.store.queries().findIndex((q) => q.msorId === query.msorId);
    return query.color ?? QUERY_COLORS[(idx < 0 ? 0 : idx) % QUERY_COLORS.length];
  }

  /** Resolves once the edit is saved (or immediately on cancel). */
  openEdit(query: MonitoringQuery): void {
    const ref = this.dialogs.open<QueryFormDialogComponent, QueryFormDialogData, MonitoringQuery>(
      QueryFormDialogComponent,
      {
        width: '42rem',
        maxWidth: '95vw',
        data: {
          query,
          categoryOptions: this.categoryOptions(),
          defaultColor: this.colorOf(query),
        },
      },
    );
    ref.afterClosed().subscribe((updated) => {
      if (updated) void this.store.loadQueries();
    });
  }

  openCreate(): void {
    const all = this.store.queries();
    const ref = this.dialogs.open<QueryFormDialogComponent, QueryFormDialogData, MonitoringQuery>(
      QueryFormDialogComponent,
      {
        width: '42rem',
        maxWidth: '95vw',
        data: {
          categoryOptions: this.categoryOptions(),
          defaultColor: QUERY_COLORS[all.length % QUERY_COLORS.length],
        },
      },
    );
    ref.afterClosed().subscribe(async (created) => {
      if (!created) return;
      await this.store.loadQueries();
      void this.router.navigate(['/query', created.msorId]);
    });
  }

  /**
   * `results` is optional: query detail already holds the run list, but the sidebar does
   * not, so it is fetched on demand there rather than kept warm for every item.
   */
  async openHistory(query: MonitoringQuery, results?: MonitoringResult[]): Promise<void> {
    let runs = results;
    if (!runs) {
      const page = await this.api.fetchResults(query.msorId, { size: 60 });
      runs = [...page.content].sort(
        (a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime(),
      );
    }
    this.dialogs.open<QueryHistoryDialogComponent, QueryHistoryDialogData, void>(
      QueryHistoryDialogComponent,
      { width: '42rem', maxWidth: '95vw', data: { query, results: runs } },
    );
  }

  /** Navigates home when the deleted item is the one currently open. */
  openDelete(query: MonitoringQuery, navigateHomeAfter = false): void {
    const ref = this.dialogs.open<DeleteConfirmDialogComponent, MonitoringQuery, boolean>(
      DeleteConfirmDialogComponent,
      { width: '26rem', maxWidth: '95vw', data: query },
    );
    ref.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      await this.api.deleteQuery(query.msorId);
      await this.store.loadQueries();
      if (navigateHomeAfter) void this.router.navigate(['/']);
    });
  }

  /**
   * On-hold items are excluded from dashboard totals and status. Toggled straight from
   * the sidebar rather than through the edit form, which is where the React source put it.
   */
  async toggleOnHold(query: MonitoringQuery): Promise<void> {
    await this.api.setOnHold(query.msorId, query.onHoldYn !== 'Y');
    await this.store.loadQueries();
  }

  async run(query: MonitoringQuery): Promise<void> {
    await this.api.triggerRun(query.msorId);
    await this.store.loadQueries();
  }
}
