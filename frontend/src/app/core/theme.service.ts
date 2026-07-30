import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'dark-mode';

/**
 * Dark mode. Replaces the `darkMode` state + `useEffect` that lived in DashboardPage.
 *
 * The class goes on `<html>` (not the app root) because the CDK appends overlay
 * containers to `<body>`, outside the Angular component tree — a class on the root
 * component would not reach dialogs, menus, or datepickers.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly darkMode = signal<boolean>(readStored());

  constructor() {
    effect(() => {
      const dark = this.darkMode();
      document.documentElement.classList.toggle('dark', dark);
      try {
        localStorage.setItem(STORAGE_KEY, String(dark));
      } catch {
        /* ignore */
      }
    });
  }

  toggle(): void {
    this.darkMode.update((v) => !v);
  }

  /**
   * Resolves a CSS custom property to a concrete colour string.
   *
   * ECharts draws to a canvas and cannot read `var(--color-…)`, so chart colours have
   * to be resolved eagerly. Callers must read `darkMode()` in the same computed for
   * this to re-run when the theme flips — the class swap alone does not notify signals.
   */
  cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
