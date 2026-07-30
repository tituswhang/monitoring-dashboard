import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import type { AllCasesRow } from '../../../core/models/monitoring';

/*
 * The Category and Item cells are links that drill into that category or monitoring
 * item, each carrying a hover description.
 *
 * `HoverDescription` in the React source was a hand-rolled portal with its own
 * positioning and enter/leave timers; `matTooltip` replaces all of it. It shows nothing
 * when the text is empty, which is the same behaviour the original had for items and
 * categories with no description.
 */

export interface CategoryCellParams extends ICellRendererParams<AllCasesRow> {
  categoryOf: (msorId: number) => string;
  colorOf: (category: string) => string;
  descriptionOf: (category: string) => string;
  select: (category: string) => void;
}

@Component({
  selector: 'app-category-cell',
  imports: [MatTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="select()"
      [title]="category()"
      [matTooltip]="description()"
      matTooltipShowDelay="400"
      class="text-xs text-primary hover:underline cursor-pointer truncate max-w-full text-left"
    >
      <span
        class="inline-block w-2 h-2 rounded-sm mr-1.5 shrink-0 align-middle"
        [style.background-color]="color()"
      ></span>
      {{ category() }}
    </button>
  `,
})
export class CategoryCellComponent implements ICellRendererAngularComp {
  protected readonly category = signal('');
  protected readonly color = signal('');
  protected readonly description = signal('');
  private params!: CategoryCellParams;

  agInit(params: CategoryCellParams): void {
    this.apply(params);
  }

  refresh(params: CategoryCellParams): boolean {
    this.apply(params);
    return true;
  }

  private apply(params: CategoryCellParams): void {
    this.params = params;
    const cat = params.categoryOf(params.data?.msorId ?? -1);
    this.category.set(cat);
    this.color.set(params.colorOf(cat));
    this.description.set(params.descriptionOf(cat));
  }

  protected select(): void {
    this.params.select(this.category());
  }
}

export interface ItemCellParams extends ICellRendererParams<AllCasesRow> {
  colorOf: (msorId: number) => string;
  descriptionOf: (msorId: number) => string;
  select: (msorId: number) => void;
}

@Component({
  selector: 'app-item-cell',
  imports: [MatTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="select()"
      [title]="title()"
      [matTooltip]="description()"
      matTooltipShowDelay="400"
      class="text-xs text-primary hover:underline cursor-pointer truncate max-w-full text-left"
    >
      <span
        class="inline-block w-2 h-2 rounded-sm mr-1.5 shrink-0 align-middle"
        [style.background-color]="color()"
      ></span>
      {{ title() }}
    </button>
  `,
})
export class ItemCellComponent implements ICellRendererAngularComp {
  protected readonly title = signal('');
  protected readonly color = signal('');
  protected readonly description = signal('');
  private msorId = -1;
  private params!: ItemCellParams;

  agInit(params: ItemCellParams): void {
    this.apply(params);
  }

  refresh(params: ItemCellParams): boolean {
    this.apply(params);
    return true;
  }

  private apply(params: ItemCellParams): void {
    this.params = params;
    this.msorId = params.data?.msorId ?? -1;
    this.title.set(params.data?.title ?? '');
    this.color.set(params.colorOf(this.msorId));
    this.description.set(params.descriptionOf(this.msorId));
  }

  protected select(): void {
    this.params.select(this.msorId);
  }
}
