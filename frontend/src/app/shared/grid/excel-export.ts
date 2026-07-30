import type { Column, GridApi } from 'ag-grid-community';
import { downloadXlsx } from '../utils/xlsx';

/**
 * Works on any AG Grid: reads the currently displayed columns and the rows in
 * their post-filter/post-sort order straight from the grid api, so the export
 * matches exactly what the user sees.
 */
export function exportAgGridToExcel(
  api: GridApi | undefined | null,
  fileName: string,
  sheetName: string,
): void {
  if (!api) return;
  const cols = api.getAllDisplayedColumns().filter((col: Column) => {
    const def = col.getColDef();
    if (def.checkboxSelection) return false; // selection checkbox column
    const header = def.headerName ?? '';
    return header !== '' && header !== '#'; // skip blank + row-number columns
  });
  const headers = cols.map(
    (col: Column) =>
      api.getDisplayNameForColumn(col, null) || col.getColDef().headerName || col.getColId(),
  );
  const rows: string[][] = [];
  api.forEachNodeAfterFilterAndSort((node) => {
    if (!node.data) return;
    rows.push(
      cols.map((col: Column) => {
        const v = api.getCellValue({ rowNode: node, colKey: col });
        return v === null || v === undefined ? '' : String(v);
      }),
    );
  });
  downloadXlsx(fileName, sheetName, headers, rows);
}
