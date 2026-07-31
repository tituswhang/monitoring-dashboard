import { CdkConnectedOverlay, CdkOverlayOrigin, type ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { cn } from '../utils/cn';

/**
 * Small click-to-open popover used to surface a description.
 *
 * A popover rather than a tooltip because the text is a paragraph, not a label: it has
 * to stay open while it is read, and be dismissed deliberately. `matTooltip` is used for
 * the short hover hints inside the grid instead.
 *
 * CDK Overlay replaces the React version's portal, `getBoundingClientRect` positioning,
 * and `mousedown` listener.
 */
@Component({
  selector: 'app-info-popover',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
  template: `
    <button
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (click)="open.set(!open())"
      title="Show description"
      [class]="triggerClass()"
    >
      <ng-icon name="lucideInfo" class="h-4 w-4" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="open.set(false)"
      (detach)="open.set(false)"
    >
      <div class="w-80 rounded-md border bg-background shadow-lg p-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          {{ label() }}
        </p>
        <p class="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {{ text() }}
        </p>
      </div>
    </ng-template>
  `,
})
export class InfoPopoverComponent {
  readonly text = input.required<string>();
  readonly label = input('Description');

  protected readonly open = signal(false);

  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

  protected triggerClass(): string {
    return cn(
      'rounded p-1 transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent',
      this.open() && 'bg-accent text-foreground',
    );
  }
}
