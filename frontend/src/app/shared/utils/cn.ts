import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind class strings, letting later classes win conflicts.
 *
 * Angular's `[class]` / `[ngClass]` cover most of what this was used for in JSX, but
 * it is still needed wherever a component composes a caller-supplied `class` on top of
 * its own defaults — the `ui/` primitives all do this.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
