import * as vscode from "vscode";
import { getQueryHistoryLimit } from "./sqlUtils";

const STORAGE_KEY = "sqlStudio.queryHistory";

/**
 * Longest SQL text kept per entry. A generated multi-megabyte statement would
 * otherwise let a few hundred entries bloat globalState; the truncated text is
 * still enough to recognise the query in the list.
 */
const MAX_SQL_LENGTH = 20_000;

/**
 * One executed statement, as shown in the Query History view. Only the
 * connection's id and display name are kept — never credentials (see
 * AGENTS.md: passwords live in SecretStorage and nowhere else).
 */
export interface QueryHistoryEntry {
  id: string;
  sql: string;
  connectionId: string;
  connectionName: string;
  dialect: string;
  /** Epoch ms of the most recent run of this entry. */
  executedAt: number;
  durationMs: number;
  rowCount?: number;
  /** Present when the run failed; the message shown in the results panel. */
  error?: string;
  /** >1 when the same query was re-run back to back and the entries collapsed. */
  runCount?: number;
  /** True when the SQL was cut to MAX_SQL_LENGTH before storing. */
  truncated?: boolean;
}

function truncateSql(sql: string): { sql: string; truncated: boolean } {
  if (sql.length <= MAX_SQL_LENGTH) {
    return { sql, truncated: false };
  }
  return { sql: sql.slice(0, MAX_SQL_LENGTH), truncated: true };
}

/**
 * Put `entry` at the front of the list. A query that is already in the history —
 * same SQL on the same connection — is not written again: the existing entry moves
 * to the top and takes the new run's timestamp, duration, row count and outcome,
 * with `runCount` counting how often it has been run. Its `id` survives, so an open
 * tree keeps tracking the same row.
 *
 * The connection is part of the identity on purpose: the same SELECT against prod
 * and against dev stays two entries, because which one you ran is the interesting
 * part.
 */
export function appendHistoryEntry(
  entries: QueryHistoryEntry[],
  entry: QueryHistoryEntry,
  limit: number
): QueryHistoryEntry[] {
  if (limit <= 0) {
    return [];
  }
  const previous = entries.find(
    (candidate) =>
      candidate.sql === entry.sql && candidate.connectionId === entry.connectionId
  );
  const rest = previous
    ? entries.filter((candidate) => candidate !== previous)
    : entries;
  // Carry the identity forward, take everything else from the run that just
  // happened — a query that failed this time must not keep an old success.
  const head: QueryHistoryEntry = previous
    ? { ...entry, id: previous.id, runCount: (previous.runCount ?? 1) + 1 }
    : entry;
  return [head, ...rest].slice(0, limit);
}

/**
 * Rolling log of executed queries in globalState, most recent first. Capacity is
 * the sqlStudio.queryHistoryLimit setting (0 disables recording entirely).
 */
export class QueryHistoryStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private read(): QueryHistoryEntry[] {
    const raw = this.context.globalState.get<QueryHistoryEntry[]>(STORAGE_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  private async write(entries: QueryHistoryEntry[]): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, entries);
    this._onDidChange.fire();
  }

  /** Stored entries, most recent first, capped to the configured limit. */
  list(): QueryHistoryEntry[] {
    const limit = getQueryHistoryLimit();
    if (limit === 0) {
      return [];
    }
    return this.read().slice(0, limit);
  }

  get(id: string): QueryHistoryEntry | undefined {
    return this.read().find((entry) => entry.id === id);
  }

  /** Record one executed statement. No-op when history is disabled. */
  async record(
    entry: Omit<QueryHistoryEntry, "id" | "truncated">
  ): Promise<void> {
    const limit = getQueryHistoryLimit();
    if (limit === 0 || !entry.sql.trim()) {
      return;
    }
    const { sql, truncated } = truncateSql(entry.sql);
    const stored: QueryHistoryEntry = {
      ...entry,
      sql,
      id: `${entry.executedAt}-${Math.random().toString(36).slice(2, 10)}`,
      ...(truncated ? { truncated: true } : {}),
    };
    await this.write(appendHistoryEntry(this.read(), stored, limit));
  }

  /** Forget a single entry. */
  async remove(id: string): Promise<void> {
    await this.write(this.read().filter((entry) => entry.id !== id));
  }

  /** Forget everything. */
  async clear(): Promise<void> {
    await this.write([]);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
