import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DashboardStore } from '../../core/dashboard-store';
import { ThemeService } from '../../core/theme.service';
import { MatMenuModule } from '@angular/material/menu';
import { NgIcon } from '@ng-icons/core';
import { MonitoringService } from '../../core/monitoring.service';
import { DialogService } from '../../shared/overlays/dialog.service';
import { SkeletonDirective } from '../../shared/ui/skeleton';
import {
  RunSelectionDialogComponent,
  type RunSelectionDialogData,
} from '../modals/run-selection-dialog';
import { QueryDialogsService } from '../modals/query-dialogs.service';
import { UserAdminDialogComponent } from '../modals/user-admin-dialog';
import { GlobalSearchComponent } from './global-search';
import { SidebarItemComponent } from './sidebar-item';
import type { MonitoringQuery } from '../../core/models/monitoring';
import { categoryColor, groupByCategory } from '../../shared/utils/category';
import { nyMonth } from '../../shared/utils/ny-date';
import { QUERY_COLORS } from '../../shared/constants';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    MatMenuModule,
    NgIcon,
    SkeletonDirective,
    GlobalSearchComponent,
    SidebarItemComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(MonitoringService);
  private readonly dialogs = inject(DialogService);
  protected readonly itemDialogs = inject(QueryDialogsService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  protected readonly store = inject(DashboardStore);

  protected readonly sidebarOpen = signal(true);
  protected readonly itemsOpen = signal(true);
  protected readonly sidebarSearch = signal('');
  protected readonly collapsedCategories = signal<ReadonlySet<string>>(new Set());

  /** Checkboxes stay hidden until select mode is on, as in the React sidebar. */
  protected readonly selectMode = signal(false);
  protected readonly checkedIds = signal<ReadonlySet<number>>(new Set());

  /** Only admins may manage users. Gating on the role, not merely on being signed in. */
  protected readonly canManageUsers = computed(
    () => this.auth.isDemoMode() || this.auth.hasRole('ADMIN'),
  );

  /** The KPI link carries the current month so it lands on a concrete dataset. */
  protected readonly kpiMonth = nyMonth();

  protected readonly filteredQueries = computed(() => {
    const term = this.sidebarSearch().trim().toLowerCase();
    const all = this.store.queries();
    if (!term) return all;
    return all.filter(
      (q) =>
        q.title.toLowerCase().includes(term) ||
        (q.category ?? '').toLowerCase().includes(term) ||
        (q.description ?? '').toLowerCase().includes(term),
    );
  });

  protected readonly groupedQueries = computed(() => groupByCategory(this.filteredQueries()));

  /** Stable colour per item — its own, or a palette slot by position. */
  protected readonly queryColors = computed(() => {
    const map = new Map<number, string>();
    this.store.queries().forEach((q, idx) => {
      map.set(q.msorId, q.color ?? QUERY_COLORS[idx % QUERY_COLORS.length]);
    });
    return map;
  });

  protected readonly skeletonRows = Array.from({ length: 6 });

  constructor() {
    // The shell owns the initial load: it outlives every routed child, so a view
    // navigated to directly finds the store already populating rather than empty.
    void this.store.loadQueries();
  }

  protected categoryColor(cat: string): string {
    return categoryColor(cat);
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  protected toggleItems(): void {
    this.itemsOpen.update((v) => !v);
  }

  protected toggleCategory(cat: string): void {
    this.collapsedCategories.update((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  protected isCollapsed(cat: string): boolean {
    return this.collapsedCategories().has(cat);
  }

  protected clearSearch(): void {
    this.sidebarSearch.set('');
  }

  /** Leaving select mode drops the selection — a hidden one would surprise the next run. */
  protected toggleSelectMode(): void {
    this.selectMode.update((v) => !v);
    if (!this.selectMode()) this.checkedIds.set(new Set());
  }

  protected toggleCheck(id: number): void {
    this.checkedIds.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected allChecked(items: MonitoringQuery[]): boolean {
    return items.length > 0 && items.every((q) => this.checkedIds().has(q.msorId));
  }

  protected someChecked(items: MonitoringQuery[]): boolean {
    return !this.allChecked(items) && items.some((q) => this.checkedIds().has(q.msorId));
  }

  protected toggleCategoryCheck(items: MonitoringQuery[]): void {
    const turnOn = !this.allChecked(items);
    this.checkedIds.update((prev) => {
      const next = new Set(prev);
      for (const q of items) {
        if (turnOn) next.add(q.msorId);
        else next.delete(q.msorId);
      }
      return next;
    });
  }

  /** Deleting the item currently open must also leave its route. */
  protected deleteItem(item: MonitoringQuery): void {
    const onIt = this.router.url.startsWith(`/query/${item.msorId}`);
    this.itemDialogs.openDelete(item, onIt);
  }

  protected openQuery(q: MonitoringQuery): void {
    void this.router.navigate(['/query', q.msorId]);
  }


  protected runItems(): void {
    const ref = this.dialogs.open<RunSelectionDialogComponent, RunSelectionDialogData, number[]>(
      RunSelectionDialogComponent,
      {
        width: '28rem',
        maxWidth: '95vw',
        data: { queries: this.store.queries(), initialSelected: this.checkedIds() },
      },
    );
    ref.afterClosed().subscribe(async (ids) => {
      if (!ids?.length) return;
      // Sequential rather than parallel: these hit the target databases, and the React
      // version's own run button ran one item at a time for the same reason.
      for (const id of ids) {
        try {
          await this.api.triggerRun(id);
        } catch (e) {
          console.error(`Run failed for item ${id}`, e);
        }
      }
      await this.store.loadQueries();
    });
  }

  protected manageUsers(): void {
    this.dialogs.open(UserAdminDialogComponent, { width: '42rem', maxWidth: '95vw' });
  }

  protected signOut(): void {
    if (this.auth.isDemoMode()) {
      this.auth.demoLogout();
      window.location.reload();
    } else {
      void this.auth.logout();
    }
  }
}
