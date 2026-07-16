import * as vscode from "vscode";
import { getRememberedTableLayoutLimit } from "./sqlUtils";

const STORAGE_KEY = "sqlStudio.tableLayouts";

/**
 * Persisted results-table layout for one query. The shape is owned by the
 * webview (TanStack Table state); the extension treats it as opaque JSON and
 * only manages LRU eviction keyed by a hash of the query text.
 */
export interface TableLayout {
  sorting?: unknown;
  columnSizing?: unknown;
  columnOrder?: unknown;
  columnVisibility?: unknown;
}

interface LayoutEntry {
  key: string;
  layout: TableLayout;
}

/**
 * LRU cache of per-query table layouts stored in globalState. Entries are held
 * most-recently-used first; capacity comes from the sqlStudio.rememberedTableLayouts
 * setting (0 disables remembering entirely).
 */
export class TableLayoutStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private read(): LayoutEntry[] {
    const raw = this.context.globalState.get<LayoutEntry[]>(STORAGE_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  private async write(entries: LayoutEntry[]): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, entries);
  }

  /** Map of query hash → layout, for injection into the webview. */
  getAll(): Record<string, TableLayout> {
    const limit = getRememberedTableLayoutLimit();
    if (limit === 0) {
      return {};
    }
    const map: Record<string, TableLayout> = {};
    for (const entry of this.read().slice(0, limit)) {
      map[entry.key] = entry.layout;
    }
    return map;
  }

  /** Save (or overwrite) a query's layout and move it to the front (most recent). */
  async save(key: string, layout: TableLayout): Promise<void> {
    const limit = getRememberedTableLayoutLimit();
    if (limit === 0 || !key) {
      return;
    }
    const entries = this.read().filter((entry) => entry.key !== key);
    entries.unshift({ key, layout });
    await this.write(entries.slice(0, limit));
  }

  /** Forget a single query's layout. */
  async reset(key: string): Promise<void> {
    if (!key) {
      return;
    }
    const entries = this.read().filter((entry) => entry.key !== key);
    await this.write(entries);
  }
}
