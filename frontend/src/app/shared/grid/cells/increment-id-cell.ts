import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import { SHOP_ADMIN_ORDER_URL } from '../shop-link';

export interface IncrementIdCellParams extends ICellRendererParams {
  /**
   * Resolves the row's shop entity id, or null when it is not linkable.
   *
   * Takes the whole row, not just its `data` bag: the per-item grid decides
   * linkability once from the item's db type, but All Cases mixes db types and has to
   * decide per row.
   */
  resolveEntityId: (row: unknown) => string | null;
  /**
   * The `data.*` key this cell renders. Named `dataColumn`, not `column` — AG Grid
   * already puts its own `Column` object on that name.
   */
  dataColumn: string;
}

/**
 * The human-facing `increment_id`, linked into the shop admin when the row carries a
 * usable entity id and a base URL is configured. Falls back to plain text otherwise —
 * which is what the public demo shows, since it ships no admin URL.
 */
@Component({
  selector: 'app-increment-id-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (incrementId()) {
      @if (href(); as url) {
        <a
          [href]="url"
          target="_blank"
          rel="noopener noreferrer"
          (click)="$event.stopPropagation()"
          class="text-primary hover:underline"
          title="Open order in shop admin"
        >
          {{ incrementId() }}
        </a>
      } @else {
        <span>{{ incrementId() }}</span>
      }
    }
  `,
})
export class IncrementIdCellComponent implements ICellRendererAngularComp {
  protected readonly incrementId = signal('');
  protected readonly href = signal<string | null>(null);

  agInit(params: IncrementIdCellParams): void {
    this.apply(params);
  }

  refresh(params: IncrementIdCellParams): boolean {
    this.apply(params);
    return true;
  }

  private apply(params: IncrementIdCellParams): void {
    const data = params.data?.data as Record<string, unknown> | undefined;
    this.incrementId.set(String(data?.[params.dataColumn] ?? ''));
    const entityId = params.resolveEntityId(params.data);
    this.href.set(entityId && SHOP_ADMIN_ORDER_URL ? `${SHOP_ADMIN_ORDER_URL}/${entityId}` : null);
  }
}
