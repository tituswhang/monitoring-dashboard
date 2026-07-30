import { Injectable, inject } from '@angular/core';
import { DashboardStore } from '../../core/dashboard-store';
import { DialogService } from '../../shared/overlays/dialog.service';
import {
  CaseActivityDialogComponent,
  type CaseActivityDialogData,
} from './case-activity-dialog';

/**
 * Opening the case activity thread, shared by every view that hosts a grid — home,
 * category, person, and query detail all surface the same Comments cell.
 *
 * Lives in the features layer rather than on `DialogService` so `shared/` keeps no
 * dependency on `features/`.
 */
@Injectable({ providedIn: 'root' })
export class CaseDialogsService {
  private readonly dialogs = inject(DialogService);
  private readonly store = inject(DashboardStore);

  openCaseActivity(e: { msorId: number; caseKey: string; caseLabel: string }): void {
    const ref = this.dialogs.open<CaseActivityDialogComponent, CaseActivityDialogData, number>(
      CaseActivityDialogComponent,
      { width: '32rem', maxWidth: '95vw', data: e },
    );
    ref.afterClosed().subscribe((posted) => {
      // The grid caches activityCount per row, so a posted comment has to invalidate it.
      if (posted) void this.store.loadCaseRows();
    });
  }
}
