import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { DashboardStore } from '../../core/dashboard-store';
import { PieChartComponent, type PieSlice } from '../../shared/charts/pie-chart';
import { CARD_DIRECTIVES } from '../../shared/ui/card';
import { BadgeDirective } from '../../shared/ui/badge';
import { monthLabel, shiftMonth } from '../../shared/utils/case-age';
import { nyMonth } from '../../shared/utils/ny-date';
import {
  BUCKET_UNATTENDED,
  BUCKET_UNATTRIBUTED,
  EMPTY_KPI,
  KPI_DESCRIPTION,
  activeOf,
  buildKpiData,
  statusPieData,
  totalOf,
  type PersonCard,
  type StatusCounts,
} from '../../shared/utils/kpi';

interface CardView {
  /** Route value: an email, or a reserved `BUCKET_*`. */
  id: string;
  title: string;
  subtitle: string;
  isYou: boolean;
  counts: StatusCounts;
  slices: PieSlice[];
  active: number;
  total: number;
}

@Component({
  selector: 'app-kpi',
  imports: [PieChartComponent, NgIcon, BadgeDirective, ...CARD_DIRECTIVES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kpi.html',
})
export class KpiComponent {
  protected readonly store = inject(DashboardStore);
  private readonly router = inject(Router);

  protected readonly description = KPI_DESCRIPTION;

  /**
   * Bound from the `month` query param. Defaults to the current month rather than
   * whatever the store last held, so a bare /kpi is a well-defined dataset.
   */
  readonly month = input(nyMonth());

  constructor() {
    effect(() => {
      void this.store.loadWorkload(this.month());
    });
  }

  protected readonly kpi = computed(() => {
    const workload = this.store.workload();
    if (!workload) return EMPTY_KPI;
    return buildKpiData(workload, this.store.caseRows());
  });

  protected readonly label = computed(() => monthLabel(this.month()));

  /** `‹ July 2026 ›` — clamped to `[earliestMonth, current]`. */
  protected readonly canGoBack = computed(() => {
    const earliest = this.store.workload()?.earliestMonth;
    return !earliest || this.month() > earliest;
  });

  protected readonly canGoForward = computed(() => this.month() < nyMonth());

  protected readonly personCards = computed<CardView[]>(() =>
    this.kpi().people.map((p) => this.toCard(p)),
  );

  /** Cases nobody touched this month and not yet DONE — the stale backlog. */
  protected readonly unattendedCard = computed<CardView | null>(() => {
    const { counts, keys } = this.kpi().unattended;
    if (keys.size === 0) return null;
    return {
      id: BUCKET_UNATTENDED,
      title: 'Unattended',
      subtitle: 'unresolved cases nobody touched',
      isYou: false,
      counts,
      slices: statusPieData(counts),
      active: activeOf(counts),
      total: totalOf(counts),
    };
  });

  protected readonly unattributedCard = computed<CardView | null>(() => {
    const { counts, keys } = this.kpi().unattributed;
    if (keys.size === 0) return null;
    return {
      id: BUCKET_UNATTRIBUTED,
      title: 'Unattributed',
      subtitle: 'touched by an entry that carries no author',
      isYou: false,
      counts,
      slices: statusPieData(counts),
      active: activeOf(counts),
      total: totalOf(counts),
    };
  });

  protected readonly totalCases = computed(() => this.store.caseRows().length);

  private toCard(p: PersonCard): CardView {
    return {
      id: p.email,
      title: p.name ?? p.email,
      subtitle: p.name ? p.email : 'cases touched',
      isYou: p.isYou,
      counts: p.counts,
      slices: statusPieData(p.counts),
      active: activeOf(p.counts),
      total: totalOf(p.counts),
    };
  }

  protected step(delta: number): void {
    void this.router.navigate([], { queryParams: { month: shiftMonth(this.month(), delta) } });
  }

  protected open(card: CardView): void {
    void this.router.navigate(['/kpi/person', card.id], {
      queryParams: { month: this.month() },
    });
  }
}
