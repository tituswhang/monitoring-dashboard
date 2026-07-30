/** `1 case` / `2 cases`. Returns the suffix, not the whole word. */
export function pluralS(count: number): string {
  return count === 1 ? '' : 's';
}
