import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { tooLargeHint } from '../utils/scan-window';

/** A failed run's error, with the raw detail behind a disclosure. */
@Component({
  selector: 'app-error-panel',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }
  `,
  template: `
    <div class="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-2">
      <div class="flex items-start gap-2">
        <ng-icon name="lucideCircleAlert" class="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-destructive">
            {{ hint() ? 'Too many results' : 'Execution failed' }}
          </p>
          <p class="mt-0.5 text-sm text-destructive/80 break-words">
            {{ hint() ?? message() }}
          </p>
        </div>
        @if (detail()) {
          <button
            type="button"
            (click)="expanded.set(!expanded())"
            class="shrink-0 flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive transition-colors cursor-pointer"
          >
            <ng-icon
              name="lucideChevronDown"
              class="h-3.5 w-3.5 transition-transform"
              [class.rotate-180]="expanded()"
            />
            {{ expanded() ? 'Hide detail' : 'Show detail' }}
          </button>
        }
      </div>
      @if (expanded() && detail(); as d) {
        <pre
          class="mt-2 overflow-x-auto rounded bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive/90 whitespace-pre-wrap break-all"
          >{{ d }}</pre
        >
      }
    </div>
  `,
})
export class ErrorPanelComponent {
  readonly message = input.required<string>();
  readonly detail = input<string | null>(null);
  readonly pastUnresolved = input(false);

  protected readonly expanded = signal(false);
  protected readonly hint = computed(() => tooLargeHint(this.message(), this.pastUnresolved()));
}

/** The banner shown when a run could not be started at all. */
@Component({
  selector: 'app-run-error',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }
  `,
  template: `
    <div class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <ng-icon name="lucideCircleAlert" class="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      <div class="min-w-0">
        <p class="text-sm font-medium text-destructive">Run not started</p>
        <p class="mt-0.5 text-sm text-destructive/80 break-words">{{ message() }}</p>
      </div>
    </div>
  `,
})
export class RunErrorComponent {
  readonly message = input.required<string>();
}
