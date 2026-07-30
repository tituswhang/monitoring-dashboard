import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { MonitoringService } from '../../core/monitoring.service';
import type { MonitoringQuery } from '../../core/models/monitoring';
import { ALL_DB_TYPES, CATEGORY_FALLBACK } from '../../shared/constants';

export interface QueryFormDialogData {
  /** Absent when creating. */
  query?: MonitoringQuery;
  categoryOptions: string[];
  defaultColor: string;
}

interface FormState {
  title: string;
  description: string;
  dbType: string;
  category: string;
  sheetName: string;
  ownerName: string;
  ownerEmail: string;
  queryInterval: string;
  recipients: string;
  sqlQuery: string;
  activeYn: 'Y' | 'N';
  frequentYn: 'Y' | 'N';
  onHoldYn: 'Y' | 'N';
  color: string;
}

/**
 * Create / edit a monitoring item. One component for both, because the forms differ only
 * in which fields are required and what the submit button does.
 */
@Component({
  selector: 'app-query-form-dialog',
  imports: [FormsModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex max-h-[90vh] flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h2 class="text-base font-semibold">
          {{ isEdit ? 'Edit' : 'New' }} Monitoring Item
        </h2>
        <button
          type="button"
          (click)="ref.close()"
          class="rounded p-1 hover:bg-accent transition-colors cursor-pointer"
        >
          <ng-icon name="lucideX" class="h-4 w-4" />
        </button>
      </div>

      <form id="query-form" (ngSubmit)="submit()" class="overflow-y-auto flex-1">
        <div class="px-6 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label [class]="labelClass" for="q-title">Title</label>
              <input
                id="q-title"
                name="title"
                [class]="fieldClass"
                [(ngModel)]="form.title"
                placeholder="Monitoring item title"
                required
              />
            </div>
            <div>
              <label [class]="labelClass" for="q-db">DB Type</label>
              <select id="q-db" name="dbType" [class]="fieldClass" [(ngModel)]="form.dbType">
                @for (t of dbTypes; track t) {
                  <option [value]="t">{{ t }}</option>
                }
              </select>
            </div>
          </div>

          <div>
            <label [class]="labelClass" for="q-desc">Description</label>
            <input
              id="q-desc"
              name="description"
              [class]="fieldClass"
              [(ngModel)]="form.description"
              placeholder="Short description"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label [class]="labelClass" for="q-cat">Category</label>
              <input
                id="q-cat"
                name="category"
                [class]="fieldClass"
                list="q-cat-options"
                maxlength="50"
                [(ngModel)]="form.category"
                placeholder="Pick or type a new category"
              />
              <datalist id="q-cat-options">
                @for (c of data.categoryOptions; track c) {
                  <option [value]="c"></option>
                }
              </datalist>
            </div>
            <div>
              <label [class]="labelClass" for="q-sheet">Sheet Name</label>
              <input
                id="q-sheet"
                name="sheetName"
                [class]="fieldClass"
                [(ngModel)]="form.sheetName"
                placeholder="Excel sheet name for reports"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label [class]="labelClass" for="q-owner">Owner Name</label>
              <input
                id="q-owner"
                name="ownerName"
                [class]="fieldClass"
                [(ngModel)]="form.ownerName"
                placeholder="e.g. John Doe"
              />
            </div>
            <div>
              <label [class]="labelClass" for="q-email">Owner Email</label>
              <input
                id="q-email"
                name="ownerEmail"
                type="email"
                [class]="fieldClass"
                [(ngModel)]="form.ownerEmail"
                placeholder="e.g. john@example.com"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label [class]="labelClass" for="q-interval">Query Interval</label>
              <input
                id="q-interval"
                name="queryInterval"
                [class]="fieldClass"
                [(ngModel)]="form.queryInterval"
                placeholder="e.g. 0 9 * * *"
                [required]="!isEdit"
              />
            </div>
            <div>
              <label [class]="labelClass" for="q-recipients">Recipients</label>
              <input
                id="q-recipients"
                name="recipients"
                [class]="fieldClass"
                [(ngModel)]="form.recipients"
                placeholder="Comma-separated emails"
                [required]="!isEdit"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div>
              <label [class]="labelClass" for="q-active">Active</label>
              <select id="q-active" name="activeYn" [class]="fieldClass" [(ngModel)]="form.activeYn">
                <option value="Y">Yes</option>
                <option value="N">No</option>
              </select>
            </div>
            <div>
              <label [class]="labelClass" for="q-freq">Frequent</label>
              <select id="q-freq" name="frequentYn" [class]="fieldClass" [(ngModel)]="form.frequentYn">
                <option value="Y">Yes</option>
                <option value="N">No</option>
              </select>
            </div>
            <div>
              <label
                [class]="labelClass"
                for="q-hold"
                title="On-hold items are excluded from dashboard totals/status"
                >On Hold</label
              >
              <select id="q-hold" name="onHoldYn" [class]="fieldClass" [(ngModel)]="form.onHoldYn">
                <option value="N">No</option>
                <option value="Y">Yes</option>
              </select>
            </div>
          </div>

          <div>
            <label [class]="labelClass" for="q-color">Color</label>
            <div class="flex items-center gap-2 mt-1">
              <input
                id="q-color"
                name="colorPicker"
                type="color"
                [ngModel]="form.color || '#4f46e5'"
                (ngModelChange)="form.color = $event"
                class="h-8 w-10 cursor-pointer rounded border border-input bg-background p-0.5"
              />
              <input
                name="colorHex"
                type="text"
                [(ngModel)]="form.color"
                placeholder="#rrggbb"
                maxlength="7"
                class="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
              />
              @if (form.color) {
                <button
                  type="button"
                  (click)="form.color = ''"
                  class="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  <ng-icon name="lucideX" class="h-3.5 w-3.5" />
                </button>
              }
            </div>
          </div>

          <div>
            <label [class]="labelClass" for="q-sql">SQL Query</label>
            <textarea
              id="q-sql"
              name="sqlQuery"
              [class]="fieldClass + ' font-mono text-xs resize-none'"
              rows="8"
              [(ngModel)]="form.sqlQuery"
              spellcheck="false"
              required
            ></textarea>
          </div>

          @if (error(); as err) {
            <p class="text-xs text-destructive flex items-center gap-1">
              <ng-icon name="lucideCircleAlert" class="h-3 w-3" />{{ err }}
            </p>
          }
        </div>
      </form>

      <div class="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
        <button
          type="button"
          (click)="ref.close()"
          class="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="query-form"
          [disabled]="saving()"
          class="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ saving() ? 'Saving…' : isEdit ? 'Save' : 'Create' }}
        </button>
      </div>
    </div>
  `,
})
export class QueryFormDialogComponent {
  protected readonly data = inject<QueryFormDialogData>(MAT_DIALOG_DATA);
  protected readonly ref =
    inject<MatDialogRef<QueryFormDialogComponent, MonitoringQuery>>(MatDialogRef);
  private readonly api = inject(MonitoringService);

  protected readonly dbTypes = ALL_DB_TYPES;
  protected readonly isEdit = !!this.data.query;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly fieldClass =
    'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring';
  protected readonly labelClass = 'block text-xs font-medium text-muted-foreground mb-1';

  protected form: FormState = this.initialForm();

  private initialForm(): FormState {
    const q = this.data.query;
    return {
      title: q?.title ?? '',
      description: q?.description ?? '',
      dbType: q?.dbType ?? ALL_DB_TYPES[0],
      category: q?.category ?? CATEGORY_FALLBACK,
      sheetName: q?.sheetName ?? '',
      ownerName: q?.ownerName ?? '',
      ownerEmail: q?.ownerEmail ?? '',
      queryInterval: q?.queryInterval ?? '',
      recipients: q?.recipients ?? '',
      sqlQuery: q?.sqlQuery ?? '',
      activeYn: q?.activeYn ?? 'Y',
      frequentYn: q?.frequentYn ?? 'N',
      onHoldYn: q?.onHoldYn ?? 'N',
      color: q?.color ?? this.data.defaultColor,
    };
  }

  /** Trimmed, with empty strings normalised to null the way the API expects. */
  private payload() {
    const f = this.form;
    return {
      title: f.title.trim(),
      description: f.description.trim() || null,
      dbType: f.dbType.trim(),
      category: f.category.trim() || CATEGORY_FALLBACK,
      sheetName: f.sheetName.trim() || null,
      ownerName: f.ownerName.trim() || null,
      ownerEmail: f.ownerEmail.trim() || null,
      queryInterval: f.queryInterval.trim() || null,
      recipients: f.recipients.trim() || null,
      sqlQuery: f.sqlQuery,
      activeYn: f.activeYn,
      frequentYn: f.frequentYn,
      onHoldYn: f.onHoldYn,
      color: f.color || null,
    };
  }

  protected async submit(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const p = this.payload();
      if (this.data.query) {
        await this.api.updateQuery(this.data.query.msorId, p);
        this.ref.close({ ...this.data.query, ...p });
      } else {
        const created = await this.api.createQuery({
          ...p,
          queryInterval: p.queryInterval ?? '',
          recipients: p.recipients ?? '',
          sheetName: p.sheetName ?? undefined,
        });
        this.ref.close(created);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
