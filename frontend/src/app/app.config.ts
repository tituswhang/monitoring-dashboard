import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideIcons } from '@ng-icons/core';
import { provideEchartsCore } from 'ngx-echarts';

import { routes } from './app.routes';
import { APP_ICONS } from './shared/icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding() is what lets route params and query params arrive as
    // component `input()`s — :id, :name, :email, and ?month all depend on it.
    provideRouter(routes, withComponentInputBinding()),
    // Lazily loaded and tree-shaken to the pie modules — see shared/charts/echarts.ts.
    provideEchartsCore({ echarts: () => import('./shared/charts/echarts') }),
    provideIcons(APP_ICONS),
    // Material's datepicker needs a date adapter; the native one is enough since the
    // app deals only in `yyyy-MM-dd` and never localises dates.
    provideNativeDateAdapter(),
  ],
};
