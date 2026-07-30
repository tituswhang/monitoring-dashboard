import { CdkConnectedOverlay, CdkOverlayOrigin, type ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import type { MonitoringQuery, MonitoringResult } from '../../core/models/monitoring';
import { QUERY_COLORS } from '../../shared/constants';
import { BadgeDirective } from '../../shared/ui/badge';

/**
 * Header search over monitoring items.
 *
 * On CDK Overlay rather than `MatAutocomplete`: the panel rows are not plain options —
 * each carries a colour chip, a case count, and a failure badge — and the trigger is a
 * plain Tailwind input, not a `mat-form-field`. The overlay gives the positioning and
 * click-outside dismissal the React version hand-rolled, without the field chrome.
 */
@Component({
  selector: 'app-global-search',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, FormsModule, NgIcon, BadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      width: 100%;
      max-width: 36rem;
    }
  `,
  template: `
    <div class="relative" cdkOverlayOrigin #origin="cdkOverlayOrigin">
      <ng-icon
        name="lucideSearch"
        class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
      />
      <input
        #box
        type="text"
        [ngModel]="value()"
        (ngModelChange)="onInput($event)"
        (focus)="open.set(true)"
        placeholder="Search monitoring items…"
        class="w-full rounded-lg border border-input bg-background pl-10 pr-9 py-2 text-sm outline-none focus:ring-2 focus:ring-ring shadow-sm"
      />
      @if (value()) {
        <button
          type="button"
          (click)="clear(box)"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ng-icon name="lucideX" class="h-3.5 w-3.5" />
        </button>
      }
    </div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open() && !!value()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayWidth]="origin.elementRef.nativeElement.offsetWidth"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="open.set(false)"
      (detach)="open.set(false)"
    >
      <div class="rounded-lg border bg-background shadow-lg overflow-hidden">
        @if (results().length === 0) {
          <p class="px-4 py-3 text-sm text-muted-foreground">No items match “{{ value() }}”</p>
        } @else {
          <ul>
            @for (r of results(); track r.query.msorId) {
              <li>
                <button
                  type="button"
                  (click)="pick(r.query)"
                  class="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-accent transition-colors cursor-pointer"
                >
                  <span
                    class="h-2 w-2 rounded-sm shrink-0"
                    [style.background-color]="r.color"
                  ></span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm">{{ r.query.title }}</span>
                    <span class="block truncate text-xs text-muted-foreground">
                      {{ r.query.category }} · {{ r.query.dbType }}
                    </span>
                  </span>
                  @if (r.isFailed) {
                    <span uiBadge variant="destructive" class="shrink-0 text-xs">Failed</span>
                  } @else if (r.count !== null) {
                    <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {{ r.count }}
                    </span>
                  }
                </button>
              </li>
            }
          </ul>
        }
      </div>
    </ng-template>
  `,
})
export class GlobalSearchComponent {
  readonly queries = input.required<MonitoringQuery[]>();
  readonly latestMap = input.required<Record<number, MonitoringResult | null>>();

  readonly select = output<MonitoringQuery>();

  protected readonly value = signal('');
  protected readonly open = signal(false);

  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

  protected readonly results = computed(() => {
    const needle = this.value().trim().toLowerCase();
    if (!needle) return [];
    const latest = this.latestMap();
    const all = this.queries();
    return all
      .filter(
        (q) =>
          q.title.toLowerCase().includes(needle) ||
          q.description?.toLowerCase().includes(needle) ||
          q.dbType?.toLowerCase().includes(needle),
      )
      .slice(0, 8)
      .map((query) => ({
        query,
        color: query.color ?? QUERY_COLORS[all.indexOf(query) % QUERY_COLORS.length],
        count: latest[query.msorId]?.resultCount ?? null,
        isFailed: latest[query.msorId]?.resultStatus === 'FAIL',
      }));
  });

  protected onInput(v: string): void {
    this.value.set(v);
    this.open.set(true);
  }

  protected clear(box: HTMLInputElement): void {
    this.value.set('');
    box.focus();
  }

  protected pick(q: MonitoringQuery): void {
    this.value.set('');
    this.open.set(false);
    this.select.emit(q);
  }
}
