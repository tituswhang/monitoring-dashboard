import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { NgIcon } from '@ng-icons/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { MonitoringQuery, MonitoringResult } from '../../core/models/monitoring';
import { BadgeDirective } from '../../shared/ui/badge';
import { cn } from '../../shared/utils/cn';

/**
 * One monitoring item in the sidebar.
 *
 * Carries more than a link: a status indicator, a hover description, an optional
 * select-for-run checkbox, and a ⋯ menu with the six per-item actions. The React
 * `SidebarItem` hand-rolled the menu's positioning and two separate click-outside
 * listeners; `MatMenu` and `matTooltip` replace all of it.
 */
@Component({
  selector: 'app-sidebar-item',
  imports: [RouterLink, RouterLinkActive, MatMenuModule, MatTooltip, NgIcon, BadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  template: `
    <div [class]="rowClass()" routerLinkActive="bg-accent" #active="routerLinkActive">
      @if (selectMode()) {
        <input
          type="checkbox"
          [checked]="checked()"
          (change)="toggleCheck.emit()"
          (click)="$event.stopPropagation()"
          title="Select for run"
          class="ml-2 shrink-0 cursor-pointer"
        />
      }

      <a
        [routerLink]="['/query', query().msorId]"
        routerLinkActive
        [matTooltip]="query().description ?? ''"
        matTooltipShowDelay="500"
        matTooltipPosition="right"
        [title]="query().title"
        class="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm cursor-pointer"
      >
        <span
          class="h-1.5 w-1.5 rounded-full shrink-0"
          [style.background-color]="color()"
        ></span>
        <span class="truncate flex-1">{{ query().title }}</span>

        <!-- On hold outranks a failure, which outranks an open-case count: an item that
             is paused is not "failing", it is simply not being looked at. -->
        @if (onHold()) {
          <ng-icon
            name="lucideCirclePause"
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-label="On hold"
          />
        } @else if (isFailed()) {
          <ng-icon name="lucideTriangleAlert" class="h-3.5 w-3.5 shrink-0 text-destructive" />
        } @else if (count() !== null && count()! > 0) {
          <span uiBadge variant="destructive" class="h-4 shrink-0 px-1 py-0 text-xs leading-none">
            {{ count() }}
          </span>
        }
      </a>

      <button
        type="button"
        [matMenuTriggerFor]="itemMenu"
        (click)="$event.stopPropagation()"
        title="Item actions"
        class="mr-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100 cursor-pointer"
      >
        <ng-icon name="lucideEllipsis" class="h-3.5 w-3.5" />
      </button>

      <mat-menu #itemMenu="matMenu">
        <button type="button" mat-menu-item (click)="run.emit()">
          <span class="flex items-center gap-2 text-xs">
            <ng-icon name="lucideZap" class="h-3.5 w-3.5" />Run Now
          </span>
        </button>
        <button type="button" mat-menu-item (click)="edit.emit()">
          <span class="flex items-center gap-2 text-xs">
            <ng-icon name="lucidePencil" class="h-3.5 w-3.5" />Edit
          </span>
        </button>
        <button type="button" mat-menu-item (click)="history.emit()">
          <span class="flex items-center gap-2 text-xs">
            <ng-icon name="lucideHistory" class="h-3.5 w-3.5" />History
          </span>
        </button>
        <button type="button" mat-menu-item (click)="toggleOnHold.emit()">
          <span class="flex items-center gap-2 text-xs">
            <ng-icon
              [name]="onHold() ? 'lucideCirclePlay' : 'lucideCirclePause'"
              class="h-3.5 w-3.5"
            />
            {{ onHold() ? 'Resume' : 'Put On Hold' }}
          </span>
        </button>
        <button type="button" mat-menu-item (click)="remove.emit()">
          <span class="flex items-center gap-2 text-xs text-destructive">
            <ng-icon name="lucideTrash2" class="h-3.5 w-3.5" />Delete
          </span>
        </button>
      </mat-menu>
    </div>
  `,
})
export class SidebarItemComponent {
  readonly query = input.required<MonitoringQuery>();
  readonly latestResult = input<MonitoringResult | null>(null);
  readonly color = input.required<string>();
  readonly selectMode = input(false);
  readonly checked = input(false);

  readonly toggleCheck = output<void>();
  readonly run = output<void>();
  readonly edit = output<void>();
  readonly history = output<void>();
  readonly remove = output<void>();
  readonly toggleOnHold = output<void>();

  protected readonly onHold = computed(() => this.query().onHoldYn === 'Y');
  protected readonly isActive = computed(() => this.query().activeYn === 'Y');
  protected readonly isFailed = computed(() => this.latestResult()?.resultStatus === 'FAIL');
  protected readonly count = computed(() => this.latestResult()?.resultCount ?? null);

  protected rowClass(): string {
    return cn(
      'group relative flex items-center rounded-md hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors',
      // Inactive items stay listed but recede — they are configuration, not work.
      !this.isActive() && 'opacity-50',
    );
  }
}
