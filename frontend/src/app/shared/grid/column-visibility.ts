import { effect, linkedSignal, type Signal } from '@angular/core';

// ── Column visibility ──────────────────────────────────────────────────────
// Two rules want to hide a column: the automatic empty-column rule, and the
// user's own choice in the column picker. They must not each drive the grid api
// separately or they clobber one another (un-hide an empty column, and the empty
// rule re-hides it on its next pass). So the user's choices are held as a sparse
// override map, resolved against the auto rule into one final visibility set,
// which a single effect applies. An absent override means "follow the default",
// which is what makes a never-touched blank column still auto-hide and a newly
// appearing column default to visible.

/** colId → visible. A missing entry means "follow the default". */
export type ColumnOverrides = Record<string, boolean>;

/** A column the user is allowed to hide. `empty` drives the muted "empty" tag. */
export interface HideableCol {
  colId: string;
  label: string;
  empty: boolean;
}

export function resolveVisible(
  colId: string,
  overrides: ColumnOverrides,
  autoHidden: ReadonlySet<string>,
): boolean {
  const o = overrides[colId];
  return o !== undefined ? o : !autoHidden.has(colId);
}

/**
 * Hideable columns that aren't data columns. The selection checkbox, "#" and
 * Status are deliberately absent: the first two are structural, and Status is the
 * column the whole case workflow runs on.
 */
export const ROWS_META_COLUMNS: HideableCol[] = [
  { colId: 'age', label: 'Age', empty: false },
  { colId: 'comments', label: 'Comments', empty: false },
];

export const ALL_CASES_META_COLUMNS: HideableCol[] = [
  { colId: 'comments', label: 'Comments', empty: false },
  { colId: 'category', label: 'Category', empty: false },
  { colId: 'title', label: 'Item', empty: false },
  { colId: 'dbType', label: 'DB Type', empty: false },
  { colId: 'runDate', label: 'First Seen', empty: false },
];

export function loadOverrides(key: string): ColumnOverrides {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Drop non-boolean values, so a stale or hand-edited entry can't poison the map.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean'),
    ) as ColumnOverrides;
  } catch {
    return {};
  }
}

export interface ColumnVisibility {
  overrides: Signal<ColumnOverrides>;
  setVisible(colId: string, visible: boolean): void;
  setAll(colIds: string[], visible: boolean): void;
  reset(): void;
}

/**
 * Per-grid column visibility, persisted under `storageKey`.
 *
 * Overrides for columns that aren't present right now are deliberately *kept*:
 * All Cases scopes its column set to the category in view, so pruning them would
 * forget the user's choice every time they switched category.
 *
 * The key changes without the component being destroyed (the grid holds its place in
 * the tree when you switch monitoring items), so the map has to re-read on change
 * rather than only at construction. `linkedSignal` is exactly that: state that resets
 * itself from a source. The React version achieved it by adjusting state during render.
 *
 * Must be called from an injection context (a component field initializer or
 * constructor) — it registers an effect to persist.
 */
export function createColumnVisibility(storageKey: Signal<string>): ColumnVisibility {
  const overrides = linkedSignal<string, ColumnOverrides>({
    source: storageKey,
    computation: (key) => loadOverrides(key),
  });

  effect(() => {
    const key = storageKey();
    const value = overrides();
    try {
      if (Object.keys(value).length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  });

  return {
    overrides: overrides.asReadonly(),
    setVisible(colId, visible) {
      overrides.update((o) => ({ ...o, [colId]: visible }));
    },
    setAll(colIds, visible) {
      overrides.update((o) => ({
        ...o,
        ...Object.fromEntries(colIds.map((c) => [c, visible])),
      }));
    },
    /** Back to pure default behaviour: auto-hide the empty columns, show everything else. */
    reset() {
      overrides.set({});
    },
  };
}
