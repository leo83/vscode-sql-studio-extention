import type {
  ColumnSizingState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import { getVsCodeApi } from "./vscodeApi";

// Persisted results-table layout for one query: column order, hidden columns,
// column widths, and sorting. Keyed by a hash of the query text; the extension
// keeps an LRU of the most recent queries (sqlStudio.rememberedTableLayouts).
export interface TableLayout {
  sorting?: SortingState;
  columnSizing?: ColumnSizingState;
  columnOrder?: string[];
  columnVisibility?: VisibilityState;
}

/**
 * Stable hash of a query's text, used as the layout-cache key. Whitespace is
 * normalized so trivially-reformatted variants of the same query share a layout.
 * FNV-1a (32-bit) rendered as base36 — collisions are irrelevant here (a clash
 * merely restores a slightly-wrong layout, never data).
 */
export function hashSql(sql: string): string {
  const normalized = sql.replace(/\s+/g, " ").trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function layoutMap(): Record<string, TableLayout> {
  return window.__SQL_STUDIO_TABLE_LAYOUTS__ ?? {};
}

/** Read the stored layout for a query hash, if any. */
export function getStoredLayout(key: string | undefined): TableLayout | undefined {
  if (!key) {
    return undefined;
  }
  return layoutMap()[key];
}

/** True when a layout carries no customization (safe to forget rather than store). */
export function isLayoutEmpty(layout: TableLayout): boolean {
  return (
    (layout.sorting?.length ?? 0) === 0 &&
    Object.keys(layout.columnSizing ?? {}).length === 0 &&
    (layout.columnOrder?.length ?? 0) === 0 &&
    Object.keys(layout.columnVisibility ?? {}).length === 0
  );
}

/** Persist (or, when empty, forget) a query's layout via the extension host. */
export function persistLayout(key: string, layout: TableLayout): void {
  const api = getVsCodeApi();
  if (!api) {
    return;
  }
  // Keep the in-page map in sync so a remount (new query into the same panel)
  // that re-reads window state before the extension re-injects still sees it.
  const map = layoutMap();
  if (isLayoutEmpty(layout)) {
    delete map[key];
    window.__SQL_STUDIO_TABLE_LAYOUTS__ = map;
    api.postMessage({ type: "resetTableLayout", hash: key });
    return;
  }
  map[key] = layout;
  window.__SQL_STUDIO_TABLE_LAYOUTS__ = map;
  api.postMessage({ type: "saveTableLayout", hash: key, layout });
}
