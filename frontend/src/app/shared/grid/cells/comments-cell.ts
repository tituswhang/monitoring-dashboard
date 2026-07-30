import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

export interface CommentsCellParams extends ICellRendererParams {
  /**
   * Fallback for the per-item grid, whose rows carry no `msorId` of their own.
   * All Cases rows do carry one, and it wins — that grid spans items.
   */
  msorId?: number;
  /**
   * Opens the case activity timeline. Wired to MatDialog in phase 7; the cell only
   * reports the click so it never owns overlay lifecycle from inside a grid row.
   */
  openActivity: (msorId: number, caseKey: string, caseLabel: string) => void;
}

/** A short, human label for a case — the order number when present, else #rowId. */
export function caseLabelFor(
  data: Record<string, unknown> | undefined,
  fallback: string | number,
): string {
  const raw =
    data?.['increment_id'] ?? data?.['INCREMENT_ID'] ?? data?.['order_id'] ?? data?.['entity_id'];
  const s = raw == null ? '' : String(raw).trim();
  return s || `#${fallback}`;
}

@Component({
  selector: 'app-comments-cell',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="open($event)"
      title="View comments & activity"
      class="flex items-center gap-1 rounded border border-input bg-background px-1.5 h-5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
    >
      <ng-icon name="lucideMessageSquare" class="h-3 w-3 shrink-0" />
      @if (count() > 0) {
        <span class="tabular-nums">{{ count() }}</span>
      } @else {
        <span>Comment</span>
      }
    </button>
  `,
})
export class CommentsCellComponent implements ICellRendererAngularComp {
  protected readonly count = signal(0);
  private params!: CommentsCellParams;

  agInit(params: CommentsCellParams): void {
    this.apply(params);
  }

  refresh(params: CommentsCellParams): boolean {
    this.apply(params);
    return true;
  }

  private apply(params: CommentsCellParams): void {
    this.params = params;
    this.count.set(params.data?.activityCount ?? 0);
  }

  protected open(event: Event): void {
    event.stopPropagation();
    const data = this.params.data as
      | { msorId?: number; caseKey?: string; rowId?: number; data?: Record<string, unknown> }
      | undefined;
    this.params.openActivity(
      data?.msorId ?? this.params.msorId ?? -1,
      data?.caseKey ?? '',
      caseLabelFor(data?.data, data?.rowId ?? ''),
    );
  }
}
