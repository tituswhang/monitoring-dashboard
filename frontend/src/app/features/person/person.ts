import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { DashboardStore } from '../../core/dashboard-store';
import { CaseDialogsService } from '../modals/case-dialogs.service';
import type { MonitoringQuery } from '../../core/models/monitoring';
import { PieChartComponent, type PieSlice } from '../../shared/charts/pie-chart';
import { AllCasesComponent } from '../../shared/grid/all-cases';
import { CARD_DIRECTIVES } from '../../shared/ui/card';
import { VerticalResizableComponent } from '../../shared/ui/vertical-resizable';
import { QUERY_COLORS } from '../../shared/constants';
import { buildCaseAgeData, caseAgeSubtitle, monthLabel } from '../../shared/utils/case-age';
import { nyMonth, nyToday } from '../../shared/utils/ny-date';
import {
  BUCKET_UNATTENDED,
  BUCKET_UNATTRIBUTED,
  EMPTY_KPI,
  buildKpiData,
  statusPieData,
} from '../../shared/utils/kpi';

/** One person's — or one bucket's — cases for a month, with All Cases locked to them. */
@Component({
  selector: 'app-person',
  imports: [VerticalResizableComponent, RouterLink, NgIcon, PieChartComponent, AllCasesComponent, ...CARD_DIRECTIVES],
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
  templateUrl: './person.html',
})
export class PersonComponent {
  protected readonly store = inject(DashboardStore);
  private readonly caseDialogs = inject(CaseDialogsService);
  private readonly router = inject(Router);

  /** An email, or one of the reserved `BUCKET_*` values (which contain no `@`). */
  readonly email = input.required<string>();
  readonly month = input(nyMonth());

  constructor() {
    effect(() => {
      void this.store.loadWorkload(this.month());
    });
  }

  private readonly kpi = computed(() => {
    const workload = this.store.workload();
    if (!workload) return EMPTY_KPI;
    return buildKpiData(workload, this.store.caseRows());
  });

  /**
   * Resolves the three cases the route can name: a real person, or either bucket.
   *
   * A deep link to somebody who touched nothing this month is legitimate — an empty page
   * that names them beats a redirect that pretends they do not exist.
   */
  private readonly subject = computed(() => {
    const id = this.email();
    const kpi = this.kpi();

    if (id === BUCKET_UNATTENDED) {
      return {
        title: 'Unattended',
        subtitle: 'unresolved cases nobody touched',
        counts: kpi.unattended.counts,
        keys: kpi.unattended.keys,
      };
    }
    if (id === BUCKET_UNATTRIBUTED) {
      return {
        title: 'Unattributed',
        subtitle: 'touched by an entry that carries no author',
        counts: kpi.unattributed.counts,
        keys: kpi.unattributed.keys,
      };
    }

    const person = kpi.people.find((p) => p.email === id);
    if (!person) {
      return { title: id, subtitle: 'no cases touched', counts: null, keys: new Set<string>() };
    }
    return {
      title: person.name ?? person.email,
      subtitle: person.name ? person.email : 'cases touched',
      counts: person.counts,
      keys: person.keys,
    };
  });

  protected readonly title = computed(() => this.subject().title);
  protected readonly subtitle = computed(() => this.subject().subtitle);

  /**
   * The `${msorId}:${caseKey}` identities this subject owns. The grid is locked to exactly
   * this set, so its row count equals the pie's total by construction.
   */
  protected readonly caseKeys = computed(() => this.subject().keys);
  protected readonly caseCount = computed(() => this.caseKeys().size);

  /** The rows behind this subject's case keys — the source for the item and age pies. */
  private readonly ownRows = computed(() => {
    const keys = this.caseKeys();
    return this.store.caseRows().filter((r) => keys.has(`${r.msorId}:${r.caseKey}`));
  });

  /** Their cases grouped by monitoring item; wedges drill into the item. */
  protected readonly byItemSlices = computed<PieSlice[]>(() => {
    const counts = new Map<number, number>();
    for (const r of this.ownRows()) counts.set(r.msorId, (counts.get(r.msorId) ?? 0) + 1);
    const all = this.store.queries();
    return [...counts.entries()]
      .map(([msorId, value]) => {
        const q = all.find((x) => x.msorId === msorId);
        const idx = all.findIndex((x) => x.msorId === msorId);
        return {
          name: q?.title ?? `Item ${msorId}`,
          value,
          color: q?.color ?? QUERY_COLORS[(idx < 0 ? 0 : idx) % QUERY_COLORS.length],
          msorId,
        };
      })
      .sort((a, b) => b.value - a.value);
  });

  private readonly caseAge = computed(() =>
    buildCaseAgeData(this.ownRows(), this.store.firstSeenByKey(), nyToday()),
  );

  protected readonly caseAgeSlices = computed<PieSlice[]>(() => this.caseAge().slices);
  protected readonly caseAgeSubtitle = computed(() => caseAgeSubtitle(this.caseAge()));

  protected onSliceItem(slice: PieSlice): void {
    if (slice.msorId != null) void this.router.navigate(['/query', slice.msorId]);
  }

  protected readonly statusSlices = computed<PieSlice[]>(() => {
    const counts = this.subject().counts;
    return counts ? statusPieData(counts) : [];
  });

  protected readonly label = computed(() => monthLabel(this.month()));

  protected onSelectQuery(q: MonitoringQuery): void {
    void this.router.navigate(['/query', q.msorId]);
  }

  protected onSelectCategory(cat: string): void {
    void this.router.navigate(['/category', cat]);
  }

  protected onRowsSaved(): void {
    this.store.refreshAfterRowWrite(this.month());
  }

  protected openActivity(e: { msorId: number; caseKey: string; caseLabel: string }): void {
    this.caseDialogs.openCaseActivity(e);
  }
}
