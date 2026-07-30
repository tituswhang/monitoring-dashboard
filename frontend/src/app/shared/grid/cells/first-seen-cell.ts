import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import type { AllCasesRow } from '../../../core/models/monitoring';
import { caseAgeBucket, isAgeable } from '../../utils/case-age';
import { nyToday } from '../../utils/ny-date';

/**
 * The "First Seen" cell, badged NEW when the case first appeared today.
 *
 * Row-hash cases are never badged: their key is re-minted every run, so "first seen
 * today" is always true of them and would mean nothing.
 */
@Component({
  selector: 'app-first-seen-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value(); as v) {
      <span class="flex items-center gap-1.5">
        {{ v }}
        @if (isNew()) {
          <span
            class="rounded-sm bg-primary/10 px-1 text-xs font-bold leading-4 tracking-wide text-primary"
            >NEW</span
          >
        }
      </span>
    }
  `,
})
export class FirstSeenCellComponent implements ICellRendererAngularComp {
  protected readonly value = signal<string | undefined>(undefined);
  protected readonly isNew = signal(false);

  agInit(params: ICellRendererParams<AllCasesRow, string>): void {
    this.apply(params);
  }

  refresh(params: ICellRendererParams<AllCasesRow, string>): boolean {
    this.apply(params);
    return true;
  }

  private apply(params: ICellRendererParams<AllCasesRow, string>): void {
    const value = params.value ?? undefined;
    this.value.set(value);
    this.isNew.set(
      !!value &&
        isAgeable({ caseKeySource: params.data?.caseKeySource ?? null }) &&
        caseAgeBucket(value, nyToday()) === 0,
    );
  }
}
