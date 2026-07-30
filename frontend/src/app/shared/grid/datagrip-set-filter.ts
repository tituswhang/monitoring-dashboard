import { ChangeDetectionStrategy, Component, computed, signal, viewChild, type ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { IFilterAngularComp } from 'ag-grid-angular';
import type { IDoesFilterPassParams, IFilterParams, IRowNode } from 'ag-grid-community';

interface ValueCount {
  value: string;
  count: number;
}

/** Blank-ish values collapse into one bucket, so the list has a row to tick for them. */
const BLANK = '(blank)';

/**
 * DataGrip-style set filter: a searchable checklist of a column's distinct values with
 * occurrence counts.
 *
 * Ported from the React `DataGripSetFilter`, which was built on `useGridFilter` — a
 * React-only AG Grid hook with no Angular counterpart. The filtering *logic* is
 * unchanged; the lifecycle is a genuine rewrite onto `IFilterAngularComp`:
 *
 * | React                       | Angular                                    |
 * |-----------------------------|--------------------------------------------|
 * | `model` prop                | `model` signal + `getModel`/`setModel`     |
 * | `onModelChange(m)`          | set signal, then `filterChangedCallback()` |
 * | `useGridFilter({doesFilterPass})` | `doesFilterPass()` method            |
 * | (implicit)                  | `isFilterActive()`                         |
 *
 * The model is a `string[]` of *included* values, or `null` for "no filter, show all" —
 * the same shape the React version used, so saved filter models stay compatible.
 */
@Component({
  selector: 'app-datagrip-set-filter',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-2 space-y-1.5" style="width: 224px">
      <input
        #searchBox
        type="text"
        [ngModel]="search()"
        (ngModelChange)="search.set($event)"
        placeholder="Search values…"
        class="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
      />

      <div class="flex items-center gap-2 px-1 pb-1 border-b">
        <input
          type="checkbox"
          [checked]="allSelected()"
          [indeterminate]="someSelected()"
          (change)="toggleAll()"
          class="cursor-pointer"
        />
        <span class="flex-1 text-xs text-muted-foreground font-mono">Select All</span>
        <span class="text-xs text-muted-foreground tabular-nums">
          {{ selected().size }}/{{ allValues().length }}
        </span>
      </div>

      <div class="max-h-52 overflow-y-auto space-y-px">
        @for (entry of filtered(); track entry.value) {
          <label
            class="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-accent cursor-pointer"
          >
            <input
              type="checkbox"
              [checked]="selected().has(entry.value)"
              (change)="toggleValue(entry.value)"
              class="cursor-pointer shrink-0"
            />
            <span class="flex-1 truncate text-xs font-mono">{{ entry.value }}</span>
            <span class="text-xs text-muted-foreground tabular-nums shrink-0">
              {{ entry.count }}
            </span>
          </label>
        } @empty {
          <p class="text-xs text-muted-foreground text-center py-2">No values match</p>
        }
      </div>

      @if (model() !== null) {
        <button
          type="button"
          (click)="clear()"
          class="w-full text-left text-xs text-muted-foreground hover:text-foreground px-1 py-1 border-t hover:bg-accent transition-colors cursor-pointer"
        >
          Clear filter
        </button>
      }
    </div>
  `,
})
export class DataGripSetFilterComponent implements IFilterAngularComp {
  private params!: IFilterParams;

  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  protected readonly allValues = signal<ValueCount[]>([]);
  protected readonly search = signal('');
  protected readonly model = signal<string[] | null>(null);

  protected readonly selected = computed(() => {
    const model = this.model();
    return model ? new Set(model) : new Set(this.allValues().map((v) => v.value));
  });

  protected readonly allSelected = computed(
    () => this.model() === null || this.selected().size >= this.allValues().length,
  );

  protected readonly someSelected = computed(
    () => !this.allSelected() && this.selected().size > 0,
  );

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const values = this.allValues();
    return term ? values.filter((v) => v.value.toLowerCase().includes(term)) : values;
  });

  agInit(params: IFilterParams): void {
    this.params = params;
  }

  /**
   * Recomputed each time the panel opens rather than once at construction.
   *
   * This is a deliberate departure from the React version, whose `useEffect(…, [])` ran
   * only on mount. AG Grid keeps a filter component alive once created, so after the grid's
   * row data was replaced — which happens here whenever a different run is selected — the
   * React filter went on offering values and counts from the *previous* dataset.
   */
  afterGuiAttached(): void {
    this.recomputeValues();
    // `autoFocus` in JSX; the panel is created before it is shown, so focus has to wait
    // until it is actually attached.
    queueMicrotask(() => this.searchBox()?.nativeElement.focus());
  }

  isFilterActive(): boolean {
    return this.model() !== null;
  }

  doesFilterPass(params: IDoesFilterPassParams): boolean {
    const model = this.model();
    if (!model) return true;
    return model.includes(this.displayValue(params.node));
  }

  getModel(): string[] | null {
    return this.model();
  }

  setModel(model: string[] | null): void {
    this.model.set(model ?? null);
  }

  protected toggleValue(value: string): void {
    const next = new Set(this.selected());
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Everything ticked is indistinguishable from no filter — collapse to null so the
    // column stops showing the filter icon.
    this.applyModel(next.size >= this.allValues().length ? null : [...next]);
  }

  protected toggleAll(): void {
    this.applyModel(this.allSelected() ? [] : null);
  }

  protected clear(): void {
    this.applyModel(null);
  }

  private applyModel(model: string[] | null): void {
    this.model.set(model);
    this.params.filterChangedCallback();
  }

  private displayValue(node: IRowNode): string {
    const raw = this.params.getValue(node);
    return raw == null || raw === '' ? BLANK : String(raw);
  }

  private recomputeValues(): void {
    const counts = new Map<string, number>();
    this.params.api.forEachNode((node) => {
      const str = this.displayValue(node);
      counts.set(str, (counts.get(str) ?? 0) + 1);
    });
    this.allValues.set(
      [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map(([value, count]) => ({ value, count })),
    );
  }
}
