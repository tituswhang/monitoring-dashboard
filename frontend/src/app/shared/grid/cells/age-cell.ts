import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import type { MonitoringResultRow } from '../../../core/models/monitoring';
import { cn } from '../../utils/cn';
import { pluralS } from '../../utils/plural';

export interface AgeCellParams extends ICellRendererParams<MonitoringResultRow, number | null> {
  /** First-seen date per `${msorId}:${caseKey}`. */
  firstSeenByKey: ReadonlyMap<string, string>;
  msorId: number;
  /** Start of the run's scan range, or null when it has none. */
  windowBegin: string | null;
}

/** Days a case has been open, badged when it predates the run's scan range. */
@Component({
  selector: 'app-age-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (days() !== null) {
      <span [class]="spanClass()" [title]="tooltip()">{{ days() }}d</span>
    }
  `,
})
export class AgeCellComponent implements ICellRendererAngularComp {
  protected readonly days = signal<number | null>(null);
  private readonly predatesWindow = signal(false);
  private readonly firstSeen = signal<string | undefined>(undefined);

  agInit(params: AgeCellParams): void {
    this.apply(params);
  }

  refresh(params: AgeCellParams): boolean {
    this.apply(params);
    return true;
  }

  private apply(params: AgeCellParams): void {
    const value = params.value ?? null;
    this.days.set(value);
    const seen = params.firstSeenByKey.get(`${params.msorId}:${params.data?.caseKey}`);
    this.firstSeen.set(seen);
    // Predating the scan range is what makes a case "past unresolved" rather than newly
    // found: it was already open before this run went looking. Worth marking out, or a
    // widened scan is just a longer undifferentiated list.
    this.predatesWindow.set(!!params.windowBegin && !!seen && seen < params.windowBegin);
  }

  protected spanClass(): string {
    return cn(
      'tabular-nums text-xs',
      this.predatesWindow() &&
        'rounded-sm bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400',
    );
  }

  protected tooltip(): string {
    const value = this.days() ?? 0;
    const base = `Open ${value} day${pluralS(value)}`;
    return this.predatesWindow()
      ? `${base} — first seen ${this.firstSeen()}, before this run's range`
      : base;
  }
}
