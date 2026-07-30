import { Directive, computed, input } from '@angular/core';
import { cn } from '../utils/cn';

/*
 * These are the lightweight presentational tables used for run history, activity
 * lists, and the user-admin grid — not the data grids. Anything needing virtual
 * scrolling, pinning, or filtering uses AG Grid instead.
 */

@Directive({
  selector: 'table[uiTable]',
  host: { '[class]': 'hostClass()' },
})
export class TableDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() => cn('w-full caption-bottom text-sm', this.userClass()));
}

@Directive({
  selector: 'thead[uiTableHeader]',
  host: { '[class]': 'hostClass()' },
})
export class TableHeaderDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() => cn('[&_tr]:border-b', this.userClass()));
}

@Directive({
  selector: 'tbody[uiTableBody]',
  host: { '[class]': 'hostClass()' },
})
export class TableBodyDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() => cn('[&_tr:last-child]:border-0', this.userClass()));
}

@Directive({
  selector: 'tr[uiTableRow]',
  host: { '[class]': 'hostClass()' },
})
export class TableRowDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() =>
    cn(
      'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: 'th[uiTableHead]',
  host: { '[class]': 'hostClass()' },
})
export class TableHeadDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() =>
    cn(
      'h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: 'td[uiTableCell]',
  host: { '[class]': 'hostClass()' },
})
export class TableCellDirective {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly hostClass = computed(() => cn('px-3 py-2.5 align-middle text-sm', this.userClass()));
}

export const TABLE_DIRECTIVES = [
  TableDirective,
  TableHeaderDirective,
  TableBodyDirective,
  TableRowDirective,
  TableHeadDirective,
  TableCellDirective,
] as const;
