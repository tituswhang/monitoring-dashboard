import { CdkConnectedOverlay, CdkOverlayOrigin, type ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { cn } from '../../shared/utils/cn';
import {
  DEFAULT_LOOKBACK_DAYS,
  defaultScanWindow,
  formatScanRange,
  isDefaultScanWindow,
  type ScanWindow,
} from '../../shared/utils/scan-window';

/**
 * "Run Now", plus a popover for the range the run should scan on the target database.
 *
 * Split rather than merged into the toolbar for a specific reason: the toolbar already
 * holds a date picker ("Select run date") that filters *recorded* runs. Two date controls
 * side by side, one filtering history and one directing a live scan, is the confusion this
 * layout exists to avoid — so the scan range lives inside the run action, and is worded as
 * an instruction ("Scan orders created…") rather than a filter ("Showing…").
 *
 * Items whose SQL still carries a literal date floor ignore the range entirely; the caller
 * renders a plain button for those instead of offering controls that would do nothing.
 *
 * Native `<input type="date">` rather than `MatDatepicker`: these are two independent
 * bounds inside a dense popover, not a linked range, and the Material field chrome does
 * not fit. The All Cases *filter* is the linked range, and that one is Material.
 */
@Component({
  selector: 'app-run-scan-control',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center">
      <button
        type="button"
        (click)="run.emit()"
        [disabled]="running()"
        [class]="runButtonClass()"
        [title]="
          wide()
            ? 'Scan every case still open since the earliest available date'
            : 'Scan ' + range()
        "
      >
        <ng-icon name="lucideZap" class="h-3.5 w-3.5" />
        {{ label() }}
      </button>
      <button
        type="button"
        cdkOverlayOrigin
        #trigger="cdkOverlayOrigin"
        (click)="open.set(!open())"
        aria-label="Scan range options"
        [attr.aria-expanded]="open()"
        [class]="caretClass()"
        title="Choose what this run scans"
      >
        <ng-icon
          name="lucideChevronDown"
          class="h-3.5 w-3.5 transition-transform"
          [class.rotate-180]="open()"
        />
      </button>
    </div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="open.set(false)"
      (detach)="open.set(false)"
    >
      <div class="w-80 rounded-md border bg-background p-3 shadow-lg space-y-3">
        <div>
          <p class="text-xs font-semibold">Scan range</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Which orders this run asks the database for — by the date they were created.
            Separate from the date filter on All Cases, which narrows cases already collected.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-xs text-muted-foreground">From</span>
            <input
              type="date"
              [value]="window().beginDate"
              [max]="window().endDate"
              [disabled]="wide()"
              (change)="patch({ beginDate: asValue($event) })"
              class="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
          <label class="block">
            <span class="text-xs text-muted-foreground">To</span>
            <input
              type="date"
              [value]="window().endDate"
              [min]="wide() ? null : window().beginDate"
              (change)="patch({ endDate: asValue($event) })"
              class="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs"
            />
          </label>
        </div>
        <p class="text-xs text-muted-foreground">Both dates are included in the scan.</p>

        <label
          class="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/50 transition-colors"
        >
          <input
            type="checkbox"
            [checked]="wide()"
            (change)="patch({ includePastUnresolved: asChecked($event) })"
            class="mt-0.5 cursor-pointer"
          />
          <span class="min-w-0">
            <span class="block text-xs font-medium">Show past unresolved cases</span>
            <span class="mt-0.5 block text-xs text-muted-foreground">
              Also return cases from before the range that nobody has marked Done. Scans all
              available history — slower, and it sends no alerts.
            </span>
          </span>
        </label>

        <div class="flex items-center justify-between pt-1">
          <button
            type="button"
            (click)="reset()"
            [disabled]="!custom()"
            class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset to last {{ lookbackDays }} days
          </button>
          <button
            type="button"
            (click)="open.set(false); run.emit()"
            [disabled]="running()"
            class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ng-icon name="lucideZap" class="h-3.5 w-3.5" />
            Run
          </button>
        </div>
      </div>
    </ng-template>
  `,
})
export class RunScanControlComponent {
  readonly window = input.required<ScanWindow>();
  readonly running = input(false);

  readonly windowChange = output<ScanWindow>();
  readonly run = output<void>();

  protected readonly lookbackDays = DEFAULT_LOOKBACK_DAYS;
  protected readonly open = signal(false);

  protected readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
  ];

  protected readonly wide = computed(() => this.window().includePastUnresolved);
  protected readonly custom = computed(() => !isDefaultScanWindow(this.window()));
  protected readonly range = computed(() =>
    formatScanRange(this.window().beginDate, this.window().endDate),
  );

  protected readonly label = computed(() => {
    if (this.running()) return 'Running…';
    return this.wide() ? 'Run — all open' : 'Run Now';
  });

  protected runButtonClass(): string {
    return cn(
      'flex items-center gap-1.5 rounded-l-md border border-r-0 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed',
      this.custom() && 'border-primary/60 text-primary',
    );
  }

  protected caretClass(): string {
    return cn(
      'flex items-center rounded-r-md border px-1.5 py-1.5 transition-colors cursor-pointer hover:bg-accent',
      this.custom() && 'border-primary/60 text-primary',
    );
  }

  protected asValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected asChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected patch(change: Partial<ScanWindow>): void {
    this.windowChange.emit({ ...this.window(), ...change });
  }

  protected reset(): void {
    this.windowChange.emit(defaultScanWindow());
  }
}
