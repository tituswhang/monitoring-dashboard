import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import type { MonitoringQuery, MonitoringResult } from '../../core/models/monitoring';
import { BadgeDirective } from '../../shared/ui/badge';
import { ErrorPanelComponent } from '../../shared/ui/error-panel';
import { formatFullDate } from '../../shared/utils/scan-window';

export interface QueryHistoryDialogData {
  query: MonitoringQuery;
  results: MonitoringResult[];
}

@Component({
  selector: 'app-query-history-dialog',
  imports: [NgIcon, BadgeDirective, ErrorPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-h-[85vh] flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div class="min-w-0">
          <h2 class="text-base font-semibold">Query History</h2>
          <p class="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
            {{ data.query.title }}
          </p>
        </div>
        <button
          type="button"
          (click)="ref.close()"
          class="rounded p-1 hover:bg-accent transition-colors cursor-pointer"
        >
          <ng-icon name="lucideX" class="h-4 w-4" />
        </button>
      </div>

      <div class="overflow-y-auto flex-1 px-6 py-4 space-y-2">
        @for (r of sorted(); track r.resultId) {
          <div class="rounded-md border overflow-hidden">
            <button
              type="button"
              (click)="toggle(r.resultId)"
              class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <ng-icon
                name="lucideChevronDown"
                class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform"
                [class.rotate-180]="expandedId() === r.resultId"
              />
              <span class="text-sm font-medium flex-1">{{ fullDate(r.runDate) }}</span>
              <div class="flex items-center gap-3 shrink-0">
                @if (r.triggeredAlertYn === 'Y') {
                  <span uiBadge variant="warning" class="text-xs">Alert sent</span>
                }
                <span class="text-xs text-muted-foreground">
                  {{ r.resultCount }} {{ r.resultCount === 1 ? 'case' : 'cases' }}
                </span>
                @if (r.executionMs != null) {
                  <span class="text-xs text-muted-foreground">{{ r.executionMs }} ms</span>
                }
                @switch (r.resultStatus) {
                  @case ('SUCCESS') {
                    <span uiBadge variant="success" class="gap-1">
                      <ng-icon name="lucideCircleCheckBig" class="h-3 w-3" />Success
                    </span>
                  }
                  @case ('FAIL') {
                    <span uiBadge variant="destructive" class="gap-1">
                      <ng-icon name="lucideCircleAlert" class="h-3 w-3" />Fail
                    </span>
                  }
                  @default {
                    <span uiBadge variant="secondary" class="gap-1">
                      <ng-icon name="lucideSkipForward" class="h-3 w-3" />Skipped
                    </span>
                  }
                }
              </div>
            </button>

            @if (expandedId() === r.resultId) {
              <div class="border-t bg-muted/20 px-4 py-3 space-y-3">
                @if (r.resultStatus === 'FAIL' && r.errorMessage) {
                  <app-error-panel
                    [message]="r.errorMessage"
                    [detail]="r.errorDetail"
                    [pastUnresolved]="r.pastUnresolvedYn === 'Y'"
                  />
                }
                <div>
                  <p
                    class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                  >
                    SQL Query
                  </p>
                  <pre
                    class="overflow-x-auto rounded-md bg-background border px-3 py-2.5 text-xs leading-relaxed font-mono whitespace-pre-wrap break-all"
                    >{{ data.query.sqlQuery }}</pre
                  >
                </div>
              </div>
            }
          </div>
        } @empty {
          <div class="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No execution history yet
          </div>
        }
      </div>
    </div>
  `,
})
export class QueryHistoryDialogComponent {
  protected readonly data = inject<QueryHistoryDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<QueryHistoryDialogComponent>>(MatDialogRef);

  /** Newest first. The caller passes runs oldest-first, as the detail view holds them. */
  protected readonly sorted = computed(() => [...this.data.results].reverse());

  protected readonly expandedId = signal<number | null>(
    this.data.results.length > 0
      ? this.data.results[this.data.results.length - 1].resultId
      : null,
  );

  protected fullDate(iso: string): string {
    return formatFullDate(iso);
  }

  protected toggle(id: number): void {
    this.expandedId.update((cur) => (cur === id ? null : id));
  }
}
