import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Replaces the page-switch state machine in the React `App.tsx`.
 *
 * The dashboard gates controls on the caller's roles, and those come from the server
 * rather than from the token, so they must be loaded before it renders — otherwise the
 * first paint would hide admin controls from an admin and then pop them in. Resolving
 * that here rather than in the component is what makes the guarantee structural: no
 * routed component can render before the identity is known.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isDemoMode()) {
    if (!auth.isDemoAuthed()) {
      return router.createUrlTree(['/demo-login'], {
        queryParams: { returnUrl: state.url },
      });
    }
    await auth.loadCurrentUser();
    return true;
  }

  const refreshed = await auth.tryRefresh();
  if (!refreshed) {
    return router.createUrlTree(['/login']);
  }
  await auth.loadCurrentUser();
  return true;
};

/** Keeps a signed-in user off the login screens. */
export const loginPageGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isDemoMode() && auth.isDemoAuthed()) return router.createUrlTree(['/']);
  return true;
};
