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
import type { AllCasesRow, MonitoringQuery, RowStatus } from '../../core/models/monitoring';
import { ALL_DB_TYPES, CATEGORY_FALLBACK, QUERY_COLORS } from '../constants';
import { DateRangePickerComponent } from '../overlays/date-range-picker';
import { InfoPopoverComponent } from '../overlays/info-popover';
import { SkeletonDirective } from '../ui/skeleton';
import { categoryColor, categoryDescription, categoryRank } from '../utils/category';
import { nyToday } from '../utils/ny-date';
import { CommentsCellComponent, caseLabelFor } from './cells/comments-cell';
import { FirstSeenCellComponent } from './cells/first-seen-cell';
import { IncrementIdCellComponent } from './cells/increment-id-cell';
import { CategoryCellComponent, ItemCellComponent } from './cells/link-cells';
import { StatusCellComponent } from './cells/status-cell';
import { ColumnPickerComponent } from './column-picker';
import {
  ALL_CASES_META_COLUMNS,
  createColumnVisibility,
  resolveVisible,
  type HideableCol,
} from './column-visibility';
import { DataGripSetFilterComponent } from './datagrip-set-filter';
import { findEmptyDataColumns } from './empty-columns';
import { EmptyColumnsToggleComponent, ExcelExportButtonComponent } from './grid-toolbar-buttons';
import { STATUS_OPTIONS } from './row-status';
import { isIncrementIdColumn, isShopLinkable, shopOrderEntityId } from './shop-link';

/** Static copy. TODO(copy): placeholder text — replace when supplied. */
export const ALL_CASES_DESCRIPTION =
  'Every open case across all monitoring items and dates in one table. Filter, triage, and ' +
  'update case status and comments inline.';

type Draft = { rowStatus: RowStatus; rowComment: string | null };

@Component({
  selector: 'app-all-cases',
  imports: [
    AgGridAngular,
    FormsModule,
    NgIcon,
    ColumnPickerComponent,
    EmptyColumnsToggleComponent,
    ExcelExportButtonComponent,
    DateRangePickerComponent,
    InfoPopoverComponent,
    SkeletonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The template root is `h-full`, i.e. height:100% — which resolves against this host.
  // A component host is `display: inline` with auto height by default, so without this
  // the whole chain collapses to zero and AG Grid renders no rows into it.
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
  templateUrl: './all-cases.html',
})
export class AllCasesComponent {
  private readonly api = inject(MonitoringService);

  readonly queries = input.required<MonitoringQuery[]>();
  readonly lockedCategory = input<string | undefined>(undefined);
  /**
   * Restricts the grid to a set of `${msorId}:${caseKey}` identities — the KPI drill-down.
   * Like `lockedCategory` it is applied client-side and is not clearable from the filter
   * bar, so the grid's row count always equals the total of the pie that opened it.
   */
  readonly lockedCaseKeys = input<ReadonlySet<string> | undefined>(undefined);
  readonly embedded = input(false);

  readonly selectQuery = output<MonitoringQuery>();
  readonly selectCategory = output<string>();
  /** Fired after a save commits, so a parent showing derived counts can refresh them. */
  readonly rowsSaved = output<void>();
  readonly openActivity = output<{ msorId: number; caseKey: string; caseLabel: string }>();

  private readonly grid = viewChild(AgGridAngular);

  protected readonly allCasesDescription = ALL_CASES_DESCRIPTION;
  protected readonly allDbTypes = ALL_DB_TYPES;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly skeletonRows = Array.from({ length: 8 });

  protected readonly rows = signal<AllCasesRow[]>([]);
  protected readonly loading = signal(true);

  protected readonly filterDbType = signal('');
  protected readonly filterStatus = signal('');
  protected readonly filterFromDate = signal('');
  protected readonly filterToDate = signal('');
  protected readonly filterMsorId = signal<number | null>(null);
  protected readonly filterCategory = signal('');

  /**
   * "New Today" pins the range to today. The previous range is stashed so turning the
   * chip off restores it rather than clearing it.
   */
  protected readonly newTodayOnly = signal(false);
  private stashedRange = { from: '', to: '' };

  protected readonly draftRows = signal<Record<number, Draft>>({});
  protected readonly saving = signal(false);
  protected readonly selectedCount = signal(0);
  protected readonly bulkComment = signal('');
  protected readonly hideEmptyCols = signal(true);
  private readonly gridReady = signal(false);

  protected readonly hasUnsavedChanges = computed(
    () => Object.keys(this.draftRows()).length > 0,
  );

  /** msorId → category, derived from the queries list (rows don't carry category). */
  private readonly categoryByMsor = computed(
    () => new Map(this.queries().map((q) => [q.msorId, q.category ?? CATEGORY_FALLBACK])),
  );

  private readonly queryColors = computed(() => {
    const map = new Map<number, string>();
    this.queries().forEach((q, idx) => {
      map.set(q.msorId, q.color ?? QUERY_COLORS[idx % QUERY_COLORS.length]);
    });
    return map;
  });

  private readonly effectiveRows = computed(() => {
    const drafts = this.draftRows();
    return this.rows().map((r) => (drafts[r.rowId] ? { ...r, ...drafts[r.rowId] } : r));
  });

  /**
   * Category and case-key locks are filtered client-side (the backend endpoint has
   * neither param). Every other filter still composes on top, so "Alice's IN_PROGRESS
   * cases in Category X" works without any of them knowing about the others.
   */
  protected readonly displayedRows = computed(() => {
    let out = this.effectiveRows();
    const locked = this.lockedCaseKeys();
    if (locked) out = out.filter((r) => locked.has(`${r.msorId}:${r.caseKey}`));
    const cat = this.filterCategory();
    if (cat) out = out.filter((r) => this.categoryOf(r.msorId) === cat);
    return out;
  });

  /** Categories present among the loaded rows, in taxonomy order. */
  protected readonly categoriesInRows = computed(() => {
    const present = new Set(this.rows().map((r) => this.categoryOf(r.msorId)));
    return [...present].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
  });

  /**
   * Columns + emptiness are scoped to the category in view. Category is filtered
   * client-side, so the backend rows span every category; without scoping, a column
   * populated only in another category would keep an all-blank column visible on a
   * category page. Uses base rows, not draft-merged ones, so editing a comment doesn't
   * churn the column set.
   */
  private readonly scopedRows = computed(() => {
    const cat = this.filterCategory();
    return cat ? this.rows().filter((r) => this.categoryOf(r.msorId) === cat) : this.rows();
  });

  protected readonly dataColumns = computed(() => [
    ...new Set(this.scopedRows().flatMap((r) => Object.keys(r.data))),
  ]);

  protected readonly emptyDataColumns = computed(() =>
    findEmptyDataColumns(this.dataColumns(), this.scopedRows()),
  );

  /**
   * One key for every category, not one per category: overrides are keyed by column
   * name and unknown names are ignored, so hiding a column hides it wherever it turns
   * up — which is what "I don't want to see this" means. The auto-hide-empty default
   * stays category-scoped underneath it.
   */
  protected readonly visibility = createColumnVisibility(signal('msor.cols.v1.allcases'));

  protected readonly autoHidden = computed(
    () => new Set(this.hideEmptyCols() ? this.emptyDataColumns().map((c) => `data.${c}`) : []),
  );

  protected readonly hideableCols = computed<HideableCol[]>(() => {
    const emptySet = new Set(this.emptyDataColumns());
    return [
      ...ALL_CASES_META_COLUMNS,
      ...this.dataColumns().map((c) => ({
        colId: `data.${c}`,
        label: c,
        empty: emptySet.has(c),
      })),
    ];
  });

  protected readonly hasActiveFilters = computed(
    () =>
      !!this.filterDbType() ||
      !!this.filterStatus() ||
      this.filterMsorId() !== null ||
      (!!this.filterCategory() && !this.lockedCategory()) ||
      !!this.filterFromDate() ||
      !!this.filterToDate(),
  );

  protected readonly exportFileName = computed(() =>
    this.lockedCategory() ? `All Cases - ${this.lockedCategory()}` : 'All Cases',
  );

  protected readonly colDefs = computed<ColDef<AllCasesRow>[]>(() => {
    const fixed: ColDef<AllCasesRow>[] = [
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
            this.stageRow(rowId, status, comment);
            return Promise.resolve();
          },
        },
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
          // No fallback msorId: All Cases spans items, so it comes off each row.
          openActivity: (msorId: number, caseKey: string, caseLabel: string) =>
            this.openActivity.emit({ msorId, caseKey, caseLabel }),
        },
      },
      {
        headerName: 'Category',
        colId: 'category',
        width: 150,
        suppressSizeToFit: true,
        filter: DataGripSetFilterComponent,
        sortable: true,
        hide: !this.isVisible('category'),
        valueGetter: (p: ValueGetterParams<AllCasesRow>) =>
          this.categoryOf(p.data?.msorId ?? -1),
        cellRenderer: CategoryCellComponent,
        cellRendererParams: {
          categoryOf: (msorId: number) => this.categoryOf(msorId),
          colorOf: (cat: string) => categoryColor(cat),
          descriptionOf: (cat: string) => categoryDescription(cat) ?? '',
          select: (cat: string) => this.selectCategory.emit(cat),
        },
      },
      {
        headerName: 'Item',
        field: 'title',
        colId: 'title',
        width: 200,
        suppressSizeToFit: true,
        filter: DataGripSetFilterComponent,
        sortable: true,
        hide: !this.isVisible('title'),
        cellRenderer: ItemCellComponent,
        cellRendererParams: {
          colorOf: (msorId: number) => this.queryColors().get(msorId) ?? '#6b7280',
          descriptionOf: (msorId: number) =>
            this.queries().find((q) => q.msorId === msorId)?.description ?? '',
          select: (msorId: number) => {
            const q = this.queries().find((x) => x.msorId === msorId);
            if (q) this.selectQuery.emit(q);
          },
        },
      },
      {
        headerName: 'DB Type',
        field: 'dbType',
        colId: 'dbType',
        width: 110,
        suppressSizeToFit: true,
        filter: DataGripSetFilterComponent,
        sortable: true,
        hide: !this.isVisible('dbType'),
      },
      {
        headerName: 'First Seen',
        field: 'runDate',
        colId: 'runDate',
        width: 140,
        suppressSizeToFit: true,
        filter: DataGripSetFilterComponent,
        sortable: true,
        sort: 'desc',
        hide: !this.isVisible('runDate'),
        cellRenderer: FirstSeenCellComponent,
      },
    ];

    const data: ColDef<AllCasesRow>[] = this.dataColumns().map((col) => {
      const def: ColDef<AllCasesRow> = {
        headerName: col,
        field: `data.${col}` as never,
        colId: `data.${col}`,
        valueGetter: (p: ValueGetterParams<AllCasesRow>) => {
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
          // Unlike the per-item grid, linkability is decided per row: All Cases mixes
          // db types, and only DATABASE1 maps to the shop admin.
          resolveEntityId: (row: unknown) => {
            const r = row as AllCasesRow | undefined;
            return isShopLinkable(r?.dbType) ? shopOrderEntityId(r?.data) : null;
          },
        };
      }
      return def;
    });

    return [...fixed, ...data];
  });

  constructor() {
    effect(() => {
      // Re-runs whenever a server-side filter changes; the client-side locks are
      // applied in `displayedRows` instead.
      const filters = {
        dbType: this.filterDbType() || undefined,
        rowStatus: this.filterStatus() || undefined,
        fromDate: this.filterFromDate() || undefined,
        toDate: this.filterToDate() || undefined,
        msorId: this.filterMsorId() ?? undefined,
      };
      void this.load(filters);
    });

    effect(() => {
      const locked = this.lockedCategory();
      if (locked) this.filterCategory.set(locked);
    });

    // Visibility is asserted through the grid api (the `hide` colDef isn't reliably
    // re-applied once the grid has mounted), and the *whole* resolved set is asserted
    // from one place so the empty-column rule and the picker can't fight over it.
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
      api.sizeColumnsToFit();
    });
  }

  private categoryOf(msorId: number): string {
    return this.categoryByMsor().get(msorId) ?? CATEGORY_FALLBACK;
  }

  private isVisible(colId: string): boolean {
    return resolveVisible(colId, this.visibility.overrides(), this.autoHidden());
  }

  protected async load(filters?: Record<string, unknown>): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(
        await this.api.fetchAllResultRows(
          filters ?? {
            dbType: this.filterDbType() || undefined,
            rowStatus: this.filterStatus() || undefined,
            fromDate: this.filterFromDate() || undefined,
            toDate: this.filterToDate() || undefined,
            msorId: this.filterMsorId() ?? undefined,
          },
        ),
      );
    } catch (e) {
      console.error('Failed to load all cases rows', e);
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleNewToday(): void {
    if (this.newTodayOnly()) {
      this.newTodayOnly.set(false);
      this.filterFromDate.set(this.stashedRange.from);
      this.filterToDate.set(this.stashedRange.to);
      return;
    }
    this.stashedRange = { from: this.filterFromDate(), to: this.filterToDate() };
    const today = nyToday();
    this.newTodayOnly.set(true);
    this.filterFromDate.set(today);
    this.filterToDate.set(today);
  }

  protected clearFilters(): void {
    this.filterDbType.set('');
    this.filterStatus.set('');
    this.filterMsorId.set(null);
    this.filterCategory.set(this.lockedCategory() ?? '');
    this.filterFromDate.set('');
    this.filterToDate.set('');
    this.newTodayOnly.set(false);
    this.stashedRange = { from: '', to: '' };
  }

  private stageRow(rowId: number, status: RowStatus, comment: string | null): void {
    this.draftRows.update((prev) => {
      const original = this.rows().find((r) => r.rowId === rowId);
      if (!original) return prev;
      if (status === original.rowStatus && comment === original.rowComment) {
        const { [rowId]: _dropped, ...rest } = prev;
        return rest;
      }
      return { ...prev, [rowId]: { rowStatus: status, rowComment: comment } };
    });
  }

  protected async save(): Promise<void> {
    const drafts = this.draftRows();
    if (Object.keys(drafts).length === 0) return;
    this.saving.set(true);
    try {
      await Promise.all(
        Object.entries(drafts).map(([rowId, change]) =>
          this.api.updateRow(Number(rowId), change.rowStatus, change.rowComment),
        ),
      );
      this.rows.update((prev) =>
        prev.map((r) => (drafts[r.rowId] ? { ...r, ...drafts[r.rowId] } : r)),
      );
      this.draftRows.set({});
      // Once per save, not once per row: a 50-case bulk apply issues 50 writes but must
      // only trigger one refresh of whatever derives counts from these rows.
      this.rowsSaved.emit();
    } finally {
      this.saving.set(false);
    }
  }

  protected onGridReady(event: GridReadyEvent): void {
    this.gridReady.set(true);
    event.api.sizeColumnsToFit();
  }

  protected getRowId = (params: { data: AllCasesRow }) => String(params.data.rowId);

  protected onSelectionChanged(): void {
    this.selectedCount.set(this.grid()?.api?.getSelectedRows().length ?? 0);
  }

  protected gridApiGetter = () => this.grid()?.api;

  protected collapseAll(): void {
    this.grid()?.api?.collapseAll();
  }

  protected deselectAll(): void {
    this.grid()?.api?.deselectAll();
    this.selectedCount.set(0);
  }

  protected onSetVisible(e: { colId: string; visible: boolean }): void {
    this.visibility.setVisible(e.colId, e.visible);
  }

  protected onSetAll(e: { colIds: string[]; visible: boolean }): void {
    this.visibility.setAll(e.colIds, e.visible);
  }

  protected stageBulkStatus(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value as RowStatus | '';
    select.value = '';
    if (!value) return;
    const api = this.grid()?.api;
    if (!api) return;
    const ids = (api.getSelectedRows() as AllCasesRow[]).map((r) => r.rowId);
    if (ids.length === 0) return;
    for (const id of ids) {
      const base = this.rows().find((r) => r.rowId === id);
      if (base) this.stageRow(id, value, this.draftRows()[id]?.rowComment ?? base.rowComment);
    }
  }

  protected async applyBulkComment(): Promise<void> {
    const text = this.bulkComment().trim();
    if (!text) return;
    const api = this.grid()?.api;
    if (!api) return;
    const selected = api.getSelectedRows() as AllCasesRow[];
    if (selected.length === 0) return;
    this.bulkComment.set('');
    try {
      await Promise.all(selected.map((r) => this.api.addCaseComment(r.msorId, r.caseKey, text)));
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

  protected caseLabel(row: AllCasesRow): string {
    return caseLabelFor(row.data, row.rowId);
  }
}
