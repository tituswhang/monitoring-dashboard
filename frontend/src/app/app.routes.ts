import type { Routes } from '@angular/router';
import { authGuard, loginPageGuard } from './core/auth.guard';

/**
 * Replaces the hand-rolled `history.pushState` + `popstate` scheme in DashboardPage.
 *
 * The old query-string URLs map on as:
 *   ?id=42                        → /query/42
 *   ?category=Orders              → /category/Orders
 *   ?kpi&month=2026-07            → /kpi?month=2026-07
 *   ?person=a@b.com&month=2026-07 → /kpi/person/a@b.com?month=2026-07
 *
 * `month` deliberately stays a query param: it has to survive the drill from KPI into a
 * person, which is why it was put in the URL in the first place (DashboardPage.tsx:4936).
 *
 * All Cases is not a route — it is embedded in the home, category, and person views.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginPageGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'demo-login',
    canActivate: [loginPageGuard],
    loadComponent: () => import('./features/login/demo-login').then((m) => m.DemoLoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
      },
      {
        path: 'query/:id',
        loadComponent: () =>
          import('./features/query-detail/query-detail').then((m) => m.QueryDetailComponent),
      },
      {
        path: 'category/:name',
        loadComponent: () => import('./features/category/category').then((m) => m.CategoryComponent),
      },
      {
        path: 'kpi',
        loadComponent: () => import('./features/kpi/kpi').then((m) => m.KpiComponent),
      },
      {
        path: 'kpi/person/:email',
        loadComponent: () => import('./features/person/person').then((m) => m.PersonComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
