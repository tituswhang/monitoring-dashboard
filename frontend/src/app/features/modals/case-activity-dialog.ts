import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { format, parseISO } from 'date-fns';
import { MonitoringService } from '../../core/monitoring.service';
import type { CaseActivity } from '../../core/models/monitoring';
import { STATUS_OPTIONS } from '../../shared/grid/row-status';

export interface CaseActivityDialogData {
  msorId: number;
  caseKey: string;
  caseLabel: string;
}

/** Prettify a status value ("OPEN" → "Open") for change entries; pass others through. */
function activityValueLabel(v: string | null): string {
  if (v === null || v === '') return '—';
  return STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

/**
 * The author of an entry, split into a display name and the email that identifies them.
 * `email` is null when it is absent, or when it is already serving as the name (users with
 * no `name` attribute in Cognito) — so it is never printed twice.
 */
function activityAuthor(
  activity: CaseActivity,
  fallbackName: string,
): { name: string; email: string | null } {
  const name = activity.authorName?.trim() || activity.authorEmail?.trim() || fallbackName;
  const email = activity.authorEmail?.trim() ?? null;
  return { name, email: email && email !== name ? email : null };
}

interface EntryView {
  id: number;
  isComment: boolean;
  when: string;
  name: string;
  email: string | null;
  text: string | null;
  icon: string;
  field: string;
  before: string;
  after: string;
}

function toView(a: CaseActivity): EntryView {
  let when: string;
  try {
    when = format(parseISO(a.createdAt), 'MMM d, h:mm a');
  } catch {
    when = a.createdAt;
  }

  if (a.entryType === 'COMMENT') {
    const { name, email } = activityAuthor(a, 'Unknown');
    return {
      id: a.activityId,
      isComment: true,
      when,
      name,
      email,
      text: a.commentText,
      icon: '',
      field: '',
      before: '',
      after: '',
    };
  }

  const isStatus = a.entryType === 'STATUS_CHANGE';
  // Change entries are one-liners, so the email rides along as a tooltip rather than inline.
  const { name, email } = activityAuthor(a, 'System');
  return {
    id: a.activityId,
    isComment: false,
    when,
    name,
    email,
    text: null,
    icon: isStatus ? 'lucideActivity' : 'lucideRefreshCw',
    field: isStatus ? 'status' : (a.fieldName ?? 'field'),
    before: isStatus ? activityValueLabel(a.oldValue) : (a.oldValue ?? '—'),
    after: isStatus ? activityValueLabel(a.newValue) : (a.newValue ?? '—'),
  };
}

/**
 * A case's comment thread and change history.
 *
 * On `MatDialog`, which supplies the backdrop, focus trap, and Escape handling the React
 * original hand-rolled — and it only ever handled Escape, never a backdrop click or
 * focus containment.
 */
@Component({
  selector: 'app-case-activity-dialog',
  imports: [FormsModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-h-[80vh] flex-col">
      <div class="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <ng-icon name="lucideMessageSquare" class="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 class="text-sm font-semibold truncate">
            Comments &amp; activity — {{ data.caseLabel }}
          </h2>
        </div>
        <button
          type="button"
          (click)="close()"
          title="Close"
          class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
        >
          <ng-icon name="lucideX" class="h-4 w-4" />
        </button>
      </div>

      <div #list class="flex-1 min-h-[8rem] overflow-y-auto px-4 py-3 space-y-3">
        @if (error() && items() === null) {
          <p class="text-sm text-destructive">{{ error() }}</p>
        } @else if (items() === null) {
          <p class="text-sm text-muted-foreground">Loading…</p>
        } @else if (entries().length === 0) {
          <p class="py-8 text-center text-sm text-muted-foreground">
            No comments or activity yet.<br />Add the first comment below.
          </p>
        } @else {
          @for (e of entries(); track e.id) {
            @if (e.isComment) {
              <div class="text-sm">
                <div class="flex items-baseline gap-2">
                  <span class="font-medium text-foreground">{{ e.name }}</span>
                  @if (e.email) {
                    <span class="min-w-0 truncate text-xs text-muted-foreground">{{ e.email }}</span>
                  }
                  <span class="shrink-0 text-xs text-muted-foreground">{{ e.when }}</span>
                </div>
                <p class="mt-0.5 whitespace-pre-wrap break-words text-foreground/90">{{ e.text }}</p>
              </div>
            } @else {
              <div class="flex items-start gap-2 text-xs">
                <ng-icon [name]="e.icon" class="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div class="min-w-0 text-muted-foreground">
                  <span class="text-foreground/80" [title]="e.email">{{ e.name }}</span>
                  changed <span class="font-medium">{{ e.field }}</span>
                  <span class="text-foreground/70">{{ e.before }} → {{ e.after }}</span>
                  <span class="ml-2 text-xs">{{ e.when }}</span>
                </div>
              </div>
            }
          }
        }
      </div>

      <div class="border-t p-3 shrink-0">
        @if (error() && items() !== null) {
          <p class="mb-2 text-xs text-destructive">{{ error() }}</p>
        }
        <div class="flex items-end gap-2">
          <textarea
            [ngModel]="draft()"
            (ngModelChange)="draft.set($event)"
            (keydown)="onKeydown($event)"
            placeholder="Write a comment…  (Enter to send, Shift+Enter for a new line)"
            rows="2"
            class="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          ></textarea>
          <button
            type="button"
            (click)="submit()"
            [disabled]="!draft().trim() || posting()"
            class="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <ng-icon name="lucideSend" class="h-3.5 w-3.5" />
            {{ posting() ? '…' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CaseActivityDialogComponent {
  protected readonly data = inject<CaseActivityDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<CaseActivityDialogComponent, number>>(MatDialogRef);
  private readonly api = inject(MonitoringService);

  private readonly list = viewChild<ElementRef<HTMLDivElement>>('list');

  protected readonly items = signal<CaseActivity[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly posting = signal(false);

  /** How many comments were posted, so the caller can bump its cached count. */
  private posted = 0;

  protected readonly entries = computed(() => (this.items() ?? []).map(toView));

  constructor() {
    this.api
      .fetchCaseActivity(this.data.msorId, this.data.caseKey)
      .then((data) => this.items.set(data))
      .catch((e) =>
        this.error.set(e instanceof Error ? e.message : 'Failed to load activity'),
      );

    // Newest entries are at the bottom, so the thread opens scrolled to them.
    effect(() => {
      this.entries();
      const el = this.list()?.nativeElement;
      if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void this.submit();
  }

  protected async submit(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.posting()) return;
    this.posting.set(true);
    this.error.set(null);
    try {
      const created = await this.api.addCaseComment(this.data.msorId, this.data.caseKey, text);
      this.items.update((prev) => [...(prev ?? []), created]);
      this.draft.set('');
      this.posted++;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      this.posting.set(false);
    }
  }

  protected close(): void {
    this.ref.close(this.posted);
  }
}
