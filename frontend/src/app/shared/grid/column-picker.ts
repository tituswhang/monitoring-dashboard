import { CdkConnectedOverlay, CdkOverlayOrigin, type ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { cn } from '../utils/cn';
import { resolveVisible, type ColumnOverrides, type HideableCol } from './column-visibility';

/**
 * Toolbar dropdown for choosing which columns a grid shows. AG Grid's own column
 * tool panel is an Enterprise feature and this app runs Community, so it's
 * hand-rolled — as the set filter and lib/xlsx.ts are, for the same reason.
 *
 * The React version portalled to `document.body` and hand-rolled both the position
 * (`getBoundingClientRect` + viewport clamping) and the dismissal (a `mousedown`
 * listener). CDK Overlay supplies all of it: `cdkConnectedOverlay` positions against
 * the trigger and falls back when it would overflow, and the transparent backdrop
 * handles click-outside.
 *
 * Deliberately not `MatMenu`: a menu closes on every item click, and this is a
 * multi-toggle checklist.
 */
@Component({
  selector: 'app-column-picker',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, FormsModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (columns().length > 0) {
      <button
        type="button"
        cdkOverlayOrigin
        #trigger="cdkOverlayOrigin"
        (click)="toggle()"
        title="Choose which columns to show"
        [class]="triggerClass()"
      >
        <ng-icon name="lucideColumns3" class="h-3 w-3" />
        Columns
        @if (hiddenCount() > 0) {
          <span class="tabular-nums">· {{ hiddenCount() }} hidden</span>
        }
      </button>

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
        <div class="rounded-md border bg-background shadow-lg p-2 space-y-1.5 w-60">
          <input
            type="text"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
            placeholder="Search columns…"
            class="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
          />

          <div class="flex items-center gap-2 px-1 pb-1 border-b text-xs">
            <button
              type="button"
              (click)="setAll.emit({ colIds: allIds(), visible: true })"
              class="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              All
            </button>
            <button
              type="button"
              (click)="setAll.emit({ colIds: allIds(), visible: false })"
              class="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              None
            </button>
            <button
              type="button"
              (click)="reset.emit()"
              title="Back to the default: empty columns hidden, everything else shown"
              class="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Reset
            </button>
            <span class="flex-1"></span>
            <span class="text-muted-foreground tabular-nums">
              {{ columns().length - hiddenCount() }}/{{ columns().length }}
            </span>
          </div>

          <div class="max-h-64 overflow-y-auto space-y-px">
            @for (c of filtered(); track c.colId) {
              <label
                class="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-accent cursor-pointer"
              >
                <input
                  type="checkbox"
                  [checked]="isVisible(c)"
                  (change)="onToggleColumn(c, $event)"
                  class="cursor-pointer shrink-0"
                />
                <span class="flex-1 truncate text-xs font-mono" [title]="c.label">{{ c.label }}</span>
                @if (c.empty) {
                  <span class="text-xs text-muted-foreground shrink-0">empty</span>
                }
              </label>
            } @empty {
              <p class="text-xs text-muted-foreground text-center py-2">No columns match</p>
            }
          </div>
        </div>
      </ng-template>
    }
  `,
})
export class ColumnPickerComponent {
  readonly columns = input.required<HideableCol[]>();
  readonly overrides = input.required<ColumnOverrides>();
  readonly autoHidden = input.required<ReadonlySet<string>>();

  readonly setVisible = output<{ colId: string; visible: boolean }>();
  readonly setAll = output<{ colIds: string[]; visible: boolean }>();
  readonly reset = output<void>();

  protected readonly open = signal(false);
  protected readonly search = signal('');

  /** Right-aligned under the trigger, flipping above when there is no room below. */
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  ];

  protected readonly allIds = computed(() => this.columns().map((c) => c.colId));

  protected readonly hiddenCount = computed(
    () => this.columns().filter((c) => !this.isVisible(c)).length,
  );

  protected readonly filtered = computed(() => {
    const needle = this.search().trim().toLowerCase();
    const cols = this.columns();
    return needle ? cols.filter((c) => c.label.toLowerCase().includes(needle)) : cols;
  });

  protected isVisible(c: HideableCol): boolean {
    return resolveVisible(c.colId, this.overrides(), this.autoHidden());
  }

  protected triggerClass(): string {
    return cn(
      'flex items-center gap-1 text-xs transition-colors cursor-pointer hover:text-foreground',
      this.hiddenCount() > 0 || this.open() ? 'text-foreground' : 'text-muted-foreground',
    );
  }

  protected toggle(): void {
    this.search.set('');
    this.open.update((v) => !v);
  }

  protected onToggleColumn(c: HideableCol, event: Event): void {
    this.setVisible.emit({
      colId: c.colId,
      visible: (event.target as HTMLInputElement).checked,
    });
  }
}
