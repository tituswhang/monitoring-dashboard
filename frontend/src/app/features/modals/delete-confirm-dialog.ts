import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import type { MonitoringQuery } from '../../core/models/monitoring';

@Component({
  selector: 'app-delete-confirm-dialog',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-between px-6 py-4 border-b shrink-0">
      <h2 class="text-base font-semibold">Delete Monitoring Item</h2>
      <button
        type="button"
        (click)="ref.close(false)"
        class="rounded p-1 hover:bg-accent transition-colors cursor-pointer"
      >
        <ng-icon name="lucideX" class="h-4 w-4" />
      </button>
    </div>
    <div class="px-6 py-4">
      <p class="text-sm text-muted-foreground">
        Are you sure you want to delete
        <span class="font-medium text-foreground">"{{ query.title }}"</span>? This will
        permanently remove the item and all its execution history.
      </p>
    </div>
    <div class="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
      <button
        type="button"
        (click)="ref.close(false)"
        class="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
      >
        Cancel
      </button>
      <button
        type="button"
        (click)="confirm()"
        [disabled]="deleting()"
        class="rounded-md bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ deleting() ? 'Deleting…' : 'Delete' }}
      </button>
    </div>
  `,
})
export class DeleteConfirmDialogComponent {
  protected readonly query = inject<MonitoringQuery>(MAT_DIALOG_DATA);
  protected readonly ref =
    inject<MatDialogRef<DeleteConfirmDialogComponent, boolean>>(MatDialogRef);

  protected readonly deleting = signal(false);

  protected confirm(): void {
    this.deleting.set(true);
    this.ref.close(true);
  }
}
