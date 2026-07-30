import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import { format, parseISO } from 'date-fns';

/**
 * Inclusive `yyyy-MM-dd` range filter.
 *
 * Replaces the React `MiniCalendar` (143 lines) and `DateRangePicker` (178) — a
 * hand-rolled month grid with its own portal, positioning, and keyboard handling —
 * with `mat-date-range-picker`. Both are deleted.
 *
 * The wire format stays `yyyy-MM-dd` strings, not `Date`s: that is what the API filters
 * take, and round-tripping through a Date at the boundary is where off-by-one-day
 * timezone bugs get in.
 */
@Component({
  selector: 'app-date-range-picker',
  imports: [MatFormFieldModule, MatInputModule, MatDatepickerModule, MatTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex items-center"
      [matTooltip]="disabled() ? disabledReason() : ''"
      matTooltipShowDelay="200"
    >
      <mat-form-field subscriptSizing="dynamic" appearance="outline" class="text-xs">
        <mat-date-range-input [rangePicker]="picker" [disabled]="disabled()">
          <input
            matStartDate
            placeholder="From"
            [value]="fromValue()"
            (dateChange)="emitFrom($event.value)"
          />
          <input
            matEndDate
            placeholder="To"
            [value]="toValue()"
            (dateChange)="emitTo($event.value)"
          />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-date-range-picker #picker />
      </mat-form-field>
    </div>
  `,
})
export class DateRangePickerComponent {
  /** Inclusive, `yyyy-MM-dd`. Empty string means unset. */
  readonly fromDate = input('');
  readonly toDate = input('');
  readonly disabled = input(false);
  readonly disabledReason = input('');

  readonly fromChange = output<string>();
  readonly toChange = output<string>();

  protected readonly fromValue = computed(() => toDate(this.fromDate()));
  protected readonly toValue = computed(() => toDate(this.toDate()));

  protected emitFrom(value: Date | null): void {
    this.fromChange.emit(toIso(value));
  }

  protected emitTo(value: Date | null): void {
    this.toChange.emit(toIso(value));
  }
}

function toDate(iso: string): Date | null {
  if (!iso) return null;
  try {
    return parseISO(iso);
  } catch {
    return null;
  }
}

function toIso(value: Date | null): string {
  return value ? format(value, 'yyyy-MM-dd') : '';
}
