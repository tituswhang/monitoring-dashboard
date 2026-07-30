import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import type { GridApi } from 'ag-grid-community';
import { pluralS } from '../utils/plural';
import { exportAgGridToExcel } from './excel-export';

/** Toolbar button that toggles visibility of all-blank columns. */
@Component({
  selector: 'app-empty-columns-toggle',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count() > 0) {
      <button
        type="button"
        (click)="toggled.emit()"
        class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        [title]="
          hidden()
            ? 'Show columns that are empty for every row'
            : 'Hide columns that are empty for every row'
        "
      >
        <ng-icon [name]="hidden() ? 'lucideEye' : 'lucideEyeOff'" class="h-3 w-3" />
        {{ hidden() ? 'Show' : 'Hide' }} {{ count() }} empty column{{ suffix() }}
      </button>
    }
  `,
})
export class EmptyColumnsToggleComponent {
  readonly count = input.required<number>();
  readonly hidden = input.required<boolean>();
  readonly toggled = output<void>();

  protected suffix(): string {
    return pluralS(this.count());
  }
}

/** Toolbar button that exports a grid to .xlsx. */
@Component({
  selector: 'app-excel-export-button',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="exportNow()"
      class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title="Export this table to Excel (.xlsx)"
    >
      <ng-icon name="lucideFileSpreadsheet" class="h-3 w-3" />
      Export Excel
    </button>
  `,
})
export class ExcelExportButtonComponent {
  /** A getter, not the api itself — the grid may not be ready when this renders. */
  readonly gridApi = input.required<() => GridApi | undefined | null>();
  readonly fileName = input.required<string>();
  readonly sheetName = input.required<string>();

  protected exportNow(): void {
    exportAgGridToExcel(this.gridApi()(), this.fileName(), this.sheetName());
  }
}
