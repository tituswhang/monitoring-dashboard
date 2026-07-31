import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';

const DIVIDER_HEIGHT = 11;

/**
 * A fixed (always-visible) header, then two stacked panes — top = charts, bottom =
 * table — separated by a draggable divider. Dragging grows one pane and shrinks the
 * other; the charts pane can collapse all the way to nothing without hiding the
 * header. The top pane height is remembered per `storageKey`.
 *
 * Content goes in via three named slots:
 *
 * ```html
 * <app-vertical-resizable storageKey="split:home:v3" [defaultTopHeight]="372">
 *   <div header>…</div>
 *   <div top>…</div>
 *   <div bottom>…</div>
 * </app-vertical-resizable>
 * ```
 */
@Component({
  selector: 'app-vertical-resizable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex: 1 1 0%;
      min-height: 0;
      flex-direction: column;
    }
  `,
  template: `
    <div class="shrink-0">
      <ng-content select="[header]" />
    </div>

    <div #topPane [style.height.px]="topHeight()" class="shrink-0 overflow-y-auto">
      <ng-content select="[top]" />
    </div>

    <div
      (mousedown)="startDrag($event)"
      role="separator"
      aria-orientation="horizontal"
      title="Drag to resize"
      class="group relative shrink-0 cursor-row-resize"
      [style.height.px]="dividerHeight"
    >
      <div
        class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border group-hover:bg-primary/40 transition-colors"
      ></div>
      <div
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-10 rounded-full bg-muted-foreground/30 group-hover:bg-primary/60 transition-colors"
      ></div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <ng-content select="[bottom]" />
    </div>
  `,
})
export class VerticalResizableComponent {
  readonly storageKey = input.required<string>();
  readonly defaultTopHeight = input(320);
  readonly minTop = input(0);
  readonly minBottom = input(0);

  protected readonly dividerHeight = DIVIDER_HEIGHT;
  private readonly topPane = viewChild<ElementRef<HTMLDivElement>>('topPane');

  protected readonly topHeight = signal(320);

  constructor() {
    // Re-read when the key changes, and persist on every move.
    effect(() => {
      this.topHeight.set(readStored(this.storageKey(), this.defaultTopHeight()));
    });

    effect(() => {
      const key = this.storageKey();
      const h = this.topHeight();
      try {
        localStorage.setItem(key, String(h));
      } catch {
        /* ignore */
      }
    });
  }

  protected startDrag(event: MouseEvent): void {
    event.preventDefault();
    const startY = event.clientY;
    const startH = this.topHeight();
    const host = (event.currentTarget as HTMLElement).parentElement;

    const onMove = (ev: MouseEvent) => {
      const pane = this.topPane()?.nativeElement;
      if (!host || !pane) return;
      // Space the charts pane may occupy below the fixed header, keeping minBottom
      // for the table and room for the divider.
      const available =
        host.getBoundingClientRect().bottom -
        pane.getBoundingClientRect().top -
        DIVIDER_HEIGHT -
        this.minBottom();
      const next = Math.min(
        Math.max(startH + (ev.clientY - startY), this.minTop()),
        Math.max(this.minTop(), available),
      );
      this.topHeight.set(next);
    };

    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
}

function readStored(key: string, fallback: number): number {
  try {
    const saved = localStorage.getItem(key);
    // Guard the null case: Number(null) is 0, which would silently collapse the pane.
    if (saved !== null) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}
