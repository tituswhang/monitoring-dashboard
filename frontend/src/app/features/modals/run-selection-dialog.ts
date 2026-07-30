import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import type { MonitoringQuery } from '../../core/models/monitoring';
import { QUERY_COLORS } from '../../shared/constants';

export interface RunSelectionDialogData {
  queries: MonitoringQuery[];
  /** Pre-ticked items; empty means "everything active". */
  initialSelected: ReadonlySet<number>;
}

/** Pick which items to run. Returns the chosen ids, or undefined on cancel. */
@Component({
  selector: 'app-run-selection-dialog',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-h-[80vh] flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h2 class="text-base font-semibold">Run Monitoring Items</h2>
        <button
          type="button"
          (click)="ref.close()"
          class="rounded p-1 hover:bg-accent transition-colors cursor-pointer"
        >
          <ng-icon name="lucideX" class="h-4 w-4" />
        </button>
      </div>

      <div class="overflow-y-auto flex-1 px-6 py-4 space-y-1">
        <label
          class="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-accent transition-colors cursor-pointer text-xs font-medium text-muted-foreground"
        >
          <input
            type="checkbox"
            [checked]="allSelected()"
            (change)="toggleAll()"
            class="cursor-pointer"
          />
          Select All
        </label>
        <div class="border-t my-2"></div>

        @for (q of active(); track q.msorId) {
          <label
            class="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
          >
            <input
              type="checkbox"
              [checked]="selected().has(q.msorId)"
              (change)="toggle(q.msorId)"
              class="cursor-pointer"
            />
            <span class="w-2 h-2 rounded-sm shrink-0" [style.background-color]="colorOf(q)"></span>
            <span class="text-sm truncate flex-1">{{ q.title }}</span>
          </label>
        } @empty {
          <p class="text-sm text-muted-foreground text-center py-4">No active monitoring items</p>
        }
      </div>

      <div class="flex justify-between items-center gap-2 px-6 py-4 border-t shrink-0">
        <span class="text-xs text-muted-foreground">
          {{ selected().size }} of {{ active().length }} selected
        </span>
        <div class="flex gap-2">
          <button
            type="button"
            (click)="ref.close()"
            class="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            (click)="ref.close([...selected()])"
            [disabled]="selected().size === 0"
            class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ng-icon name="lucidePlay" class="h-3.5 w-3.5" />
            Run Selected
          </button>
        </div>
      </div>
    </div>
  `,
})
export class RunSelectionDialogComponent {
  protected readonly data = inject<RunSelectionDialogData>(MAT_DIALOG_DATA);
  protected readonly ref =
    inject<MatDialogRef<RunSelectionDialogComponent, number[]>>(MatDialogRef);

  protected readonly active = computed(() =>
    this.data.queries.filter((q) => q.activeYn === 'Y'),
  );

  protected readonly selected = signal<ReadonlySet<number>>(
    this.data.initialSelected.size > 0
      ? new Set(this.data.initialSelected)
      : new Set(this.data.queries.filter((q) => q.activeYn === 'Y').map((q) => q.msorId)),
  );

  protected readonly allSelected = computed(
    () => this.active().length > 0 && this.selected().size === this.active().length,
  );

  protected colorOf(q: MonitoringQuery): string {
    const idx = this.data.queries.indexOf(q);
    return q.color ?? QUERY_COLORS[(idx < 0 ? 0 : idx) % QUERY_COLORS.length];
  }

  protected toggle(id: number): void {
    this.selected.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleAll(): void {
    this.selected.set(
      this.allSelected() ? new Set() : new Set(this.active().map((q) => q.msorId)),
    );
  }
}
