import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GridReadyEvent, ValueGetterParams } from 'ag-grid-community';
import './ag-grid-setup';
import { MonitoringService } from '../../core/monitoring.service';
import type { MonitoringResultRow, RowStatus } from '../../core/models/monitoring';
import { daysOpen, isAgeable } from '../utils/case-age';
import { nyToday } from '../utils/ny-date';
import { AgeCellComponent } from './cells/age-cell';
import { CommentsCellComponent, caseLabelFor } from './cells/comments-cell';
import { IncrementIdCellComponent } from './cells/increment-id-cell';
import { StatusCellComponent } from './cells/status-cell';
import { ColumnPickerComponent } from './column-picker';
import {
  ROWS_META_COLUMNS,
  createColumnVisibility,
  resolveVisible,
  type HideableCol,
} from './column-visibility';
import { DataGripSetFilterComponent } from './datagrip-set-filter';
import { findEmptyDataColumns } from './empty-columns';
import { EmptyColumnsToggleComponent, ExcelExportButtonComponent } from './grid-toolbar-buttons';
import { STATUS_OPTIONS } from './row-status';
import { isIncrementIdColumn, isShopLinkable, shopOrderEntityId } from './shop-link';

/** A bulk change: set status and/or comment. A missing key leaves that field untouched. */
export interface BulkRowChange {
  status?: RowStatus;
  comment?: string | null;
}

@Component({
  selector: 'app-rows-table',
  imports: [
    AgGridAngular,
    FormsModule,
    NgIcon,
    ColumnPickerComponent,
    EmptyColumnsToggleComponent,
    ExcelExportButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // See AllCasesComponent: the template root is `h-full`, so the host needs a real
  // height or AG Grid gets a zero-height container and draws nothing.
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
  templateUrl: './rows-table.html',
})
export class RowsTableComponent {
  private readonly api = inject(MonitoringService);

  readonly rows = input.required<MonitoringResultRow[]>();
  readonly dbType = input.required<string>();
  readonly msorId = input.required<number>();
  /** `msorId:caseKey` -> first-seen date. Absent for a case whose history has not loaded. */
  readonly firstSeenByKey = input.required<ReadonlyMap<string, string>>();
  /** First day the run scanned; a case first seen before it is older than this run's range. */
  readonly windowBegin = input.required<string | null>();
  readonly exportFileName = input.required<string>();
  readonly exportSheetName = input.required<string>();

  readonly updateRow = output<{ rowId: number; status: RowStatus; comment: string | null }>();
  readonly bulkUpdate = output<{ rowIds: number[]; changes: BulkRowChange }>();
  readonly openActivity = output<{ msorId: number; caseKey: string; caseLabel: string }>();

  private readonly grid = viewChild(AgGridAngular);

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly selectedCount = signal(0);
  protected readonly bulkComment = signal('');
  protected readonly hideEmpty = signal(true);
  private readonly gridReady = signal(false);

  protected readonly columns = computed(() => [
    ...new Set(this.rows().flatMap((r) => Object.keys(r.data))),
  ]);

  protected readonly emptyColumns = computed(() =>
    findEmptyDataColumns(this.columns(), this.rows()),
  );

  /**
   * Column choices are remembered per monitoring item — the column set differs per
   * item, and so does what's worth looking at. The key changes without this component
   * being destroyed, which is why `createColumnVisibility` re-reads on change.
   */
  private readonly storageKey = computed(() => `msor.cols.v1.item.${this.msorId()}`);
  protected readonly visibility = createColumnVisibility(this.storageKey);

  /** The auto rule, keyed by colId so it composes with the picker's overrides. */
  protected readonly autoHidden = computed(
    () => new Set(this.hideEmpty() ? this.emptyColumns().map((c) => `data.${c}`) : []),
  );

  protected readonly hideableCols = computed<HideableCol[]>(() => {
    const emptySet = new Set(this.emptyColumns());
    return [
      ...ROWS_META_COLUMNS,
      ...this.columns().map((c) => ({
        colId: `data.${c}`,
        label: c,
        empty: emptySet.has(c),
      })),
    ];
  });

  private isVisible(colId: string): boolean {
    return resolveVisible(colId, this.visibility.overrides(), this.autoHidden());
  }

  protected readonly colDefs = computed<ColDef<MonitoringResultRow>[]>(() => {
    const msorId = this.msorId();
    const dbType = this.dbType();
    const firstSeenByKey = this.firstSeenByKey();
    const windowBegin = this.windowBegin();

    const fixed: ColDef<MonitoringResultRow>[] = [
      {
        headerCheckboxSelection: true,
        checkboxSelection: true,
        width: 36,
        maxWidth: 36,
        pinned: 'left',
        sortable: false,
        filter: false,
        resizable: false,
        suppressSizeToFit: true,
        headerName: '',
      },
      {
        headerName: '#',
        valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
        width: 44,
        minWidth: 44,
        maxWidth: 44,
        pinned: 'left',
        sortable: false,
        suppressSizeToFit: true,
        cellClass: 'text-center text-xs text-muted-foreground tabular-nums',
      },
      {
        headerName: 'Status',
        field: 'rowStatus',
        colId: 'rowStatus',
        width: 150,
        suppressSizeToFit: true,
        filter: DataGripSetFilterComponent,
        cellRenderer: StatusCellComponent,
        cellRendererParams: {
          onUpdate: (rowId: number, status: RowStatus, comment: string | null) => {
            this.updateRow.emit({ rowId, status, comment });
            return Promise.resolve();
          },
        },
      },
      {
        headerName: 'Age',
        colId: 'age',
        width: 110,
        suppressSizeToFit: true,
        filter: false,
        hide: !this.isVisible('age'),
        // Sorts on the number, not the rendered "21d" string, so ordering is numeric
        // rather than lexical ("9d" would otherwise sort after "21d").
        valueGetter: (p: ValueGetterParams<MonitoringResultRow>) => {
          const seen = firstSeenByKey.get(`${msorId}:${p.data?.caseKey}`);
          if (!seen || !isAgeable({ caseKeySource: p.data?.caseKeySource ?? null })) return null;
          return daysOpen(seen, nyToday());
        },
        cellRenderer: AgeCellComponent,
        cellRendererParams: { firstSeenByKey, msorId, windowBegin },
      },
      {
        headerName: 'Comments',
        colId: 'comments',
        width: 130,
        suppressSizeToFit: true,
        filter: false,
        sortable: false,
        hide: !this.isVisible('comments'),
        cellRenderer: CommentsCellComponent,
        cellRendererParams: {
          msorId,
          openActivity: (id: number, caseKey: string, caseLabel: string) =>
            this.openActivity.emit({ msorId: id, caseKey, caseLabel }),
        },
      },
    ];

    const data: ColDef<MonitoringResultRow>[] = this.columns().map((col) => {
      const def: ColDef<MonitoringResultRow> = {
        headerName: col,
        field: `data.${col}` as never,
        colId: `data.${col}`,
        valueGetter: (p: ValueGetterParams<MonitoringResultRow>) => {
          const v = p.data?.data?.[col];
          return v === null || v === undefined ? '' : String(v);
        },
        filter: DataGripSetFilterComponent,
        sortable: true,
        resizable: true,
        minWidth: 120,
        hide: !this.isVisible(`data.${col}`),
      };
      if (isIncrementIdColumn(col)) {
        def.cellRenderer = IncrementIdCellComponent;
        def.cellRendererParams = {
          dataColumn: col,
          // Linkability is fixed for this grid — every row belongs to the same item,
          // so the item's db type decides it once.
          resolveEntityId: (row: unknown) =>
            isShopLinkable(dbType)
              ? shopOrderEntityId((row as MonitoringResultRow | undefined)?.data)
              : null,
        };
      }
      return def;
    });

    return [...fixed, ...data];
  });

  constructor() {
    // Visibility has to be asserted through the grid api: the `hide` colDef isn't
    // reliably re-applied once the grid has mounted. It is still set above so the
    // first paint is right and hidden columns never flash in. This asserts the
    // *whole* resolved set — auto-hidden and user-hidden alike — from one place, so
    // the empty-column rule and the picker can't fight over the api.
    effect(() => {
      const api = this.grid()?.api;
      if (!this.gridReady() || !api) return;
      const resolved = this.hideableCols().map((c) => ({
        colId: c.colId,
        visible: this.isVisible(c.colId),
      }));
      const show = resolved.filter((v) => v.visible).map((v) => v.colId);
      const hide = resolved.filter((v) => !v.visible).map((v) => v.colId);
      if (show.length) api.setColumnsVisible(show, true);
      if (hide.length) api.setColumnsVisible(hide, false);
      // Re-fill the width — otherwise hiding a column leaves dead space on the right.
      api.sizeColumnsToFit();
    });
  }

  protected getRowId = (params: { data: MonitoringResultRow }) => String(params.data.rowId);

  protected onGridReady(event: GridReadyEvent): void {
    this.gridReady.set(true);
    event.api.sizeColumnsToFit();
  }

  protected onSelectionChanged(): void {
    this.selectedCount.set(this.grid()?.api?.getSelectedRows().length ?? 0);
  }

  protected onSetVisible(e: { colId: string; visible: boolean }): void {
    this.visibility.setVisible(e.colId, e.visible);
  }

  protected onSetAll(e: { colIds: string[]; visible: boolean }): void {
    this.visibility.setAll(e.colIds, e.visible);
  }

  protected gridApiGetter = () => this.grid()?.api;

  protected collapseAll(): void {
    this.grid()?.api?.collapseAll();
  }

  protected deselectAll(): void {
    this.grid()?.api?.deselectAll();
    this.selectedCount.set(0);
  }

  /**
   * Bulk edits stage into the same pending-changes buffer as inline edits, so the single
   * "Save Changes" button commits everything at once. Nothing is persisted until then.
   */
  protected stageBulkStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as RowStatus | '';
    (event.target as HTMLSelectElement).value = '';
    if (!value) return;
    const api = this.grid()?.api;
    if (!api) return;
    const ids = (api.getSelectedRows() as MonitoringResultRow[]).map((r) => r.rowId);
    if (ids.length === 0) return;
    this.bulkUpdate.emit({ rowIds: ids, changes: { status: value } });
  }

  /**
   * Bulk comment posts one comment to every selected case's activity thread
   * (append-only), rather than staging a single-field edit.
   */
  protected async applyBulkComment(): Promise<void> {
    const text = this.bulkComment().trim();
    if (!text) return;
    const api = this.grid()?.api;
    if (!api) return;
    const selected = api.getSelectedRows() as MonitoringResultRow[];
    if (selected.length === 0) return;
    this.bulkComment.set('');
    try {
      await Promise.all(selected.map((r) => this.api.addCaseComment(this.msorId(), r.caseKey, text)));
      selected.forEach((r) => {
        r.activityCount = (r.activityCount ?? 0) + 1;
      });
      api.refreshCells({ force: true });
    } catch (e) {
      console.error('Failed to post bulk comment', e);
    }
  }

  protected onBulkCommentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void this.applyBulkComment();
  }

  protected caseLabel(row: MonitoringResultRow): string {
    return caseLabelFor(row.data, row.rowId);
  }
}
