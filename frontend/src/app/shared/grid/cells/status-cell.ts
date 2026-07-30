import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import type { MonitoringResultRow, RowStatus } from '../../../core/models/monitoring';
import { cn } from '../../utils/cn';
import { STATUS_OPTIONS, statusSelectClass } from '../row-status';

export interface StatusCellParams extends ICellRendererParams<MonitoringResultRow> {
  onUpdate: (rowId: number, status: RowStatus, comment: string | null) => Promise<void>;
}

/**
 * The status dropdown. A native `<select>` rather than `MatSelect`: it lives inside a
 * grid cell 20px tall, and Material's overlay-backed select brings its own trigger
 * chrome and minimum height that would not fit the row.
 */
@Component({
  selector: 'app-status-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (row(); as r) {
      <select
        [value]="r.rowStatus"
        (change)="onChange($event)"
        [disabled]="saving()"
        [class]="selectClass()"
      >
        @for (opt of options; track opt.value) {
          <option [value]="opt.value" [selected]="opt.value === r.rowStatus">
            {{ opt.label }}
          </option>
        }
      </select>
    }
  `,
})
export class StatusCellComponent implements ICellRendererAngularComp {
  protected readonly options = STATUS_OPTIONS;
  protected readonly row = signal<MonitoringResultRow | undefined>(undefined);
  protected readonly saving = signal(false);

  private params!: StatusCellParams;

  agInit(params: StatusCellParams): void {
    this.params = params;
    this.row.set(params.data);
  }

  refresh(params: StatusCellParams): boolean {
    this.params = params;
    this.row.set(params.data);
    return true;
  }

  protected selectClass(): string {
    const status = this.row()?.rowStatus ?? 'OPEN';
    return cn(
      'text-xs rounded border px-1 py-0 outline-none cursor-pointer disabled:opacity-50 h-5 leading-none',
      statusSelectClass(status),
    );
  }

  protected async onChange(event: Event): Promise<void> {
    const row = this.row();
    if (!row) return;
    const next = (event.target as HTMLSelectElement).value as RowStatus;
    this.saving.set(true);
    try {
      await this.params.onUpdate(row.rowId, next, row.rowComment);
    } finally {
      this.saving.set(false);
    }
  }
}
