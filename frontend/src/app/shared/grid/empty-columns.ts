/**
 * A cell is blank when it's null/undefined or a whitespace-only string, so a
 * column that is empty strings (or spaces) across every row collapses too.
 */
export function isBlankCell(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return String(v).trim() === '';
}

/** Data columns blank in every row — collapsed by default. */
export function findEmptyDataColumns<T extends { data: Record<string, unknown> }>(
  columns: string[],
  rows: T[],
): string[] {
  if (rows.length === 0) return [];
  return columns.filter((col) => rows.every((r) => isBlankCell(r.data?.[col])));
}
