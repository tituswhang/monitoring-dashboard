import { Injectable, inject } from '@angular/core';
import { MatDialog, type MatDialogConfig, type MatDialogRef } from '@angular/material/dialog';
import type { ComponentType } from '@angular/cdk/portal';
import { NavigationStart, Router } from '@angular/router';
import { filter, takeUntil } from 'rxjs';

/**
 * Opens app dialogs with one consistent configuration.
 *
 * Beyond deduplicating the config, this enforces two behaviours the React modals lacked:
 *
 * 1. **Close on navigation.** Back/Forward means "leave this screen", and a modal must
 *    leave with it. The React version needed an explicit `closeOverlays()` in its
 *    `popstate` handler precisely because a left-mounted modal's backdrop covered
 *    whatever the navigation landed on and swallowed every click — the page looked
 *    merely dimmed and was in fact dead. Here the router does it.
 * 2. **Escape and backdrop click.** MatDialog gives both by default; of the seven React
 *    modals, only two handled Escape and none closed on a backdrop click.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  open<C, D = unknown, R = unknown>(
    component: ComponentType<C>,
    config: MatDialogConfig<D> = {},
  ): MatDialogRef<C, R> {
    const ref = this.dialog.open<C, D, R>(component, {
      panelClass: 'app-dialog',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      ...config,
    });

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationStart),
        takeUntil(ref.afterClosed()),
      )
      .subscribe(() => ref.close());

    return ref;
  }
}
