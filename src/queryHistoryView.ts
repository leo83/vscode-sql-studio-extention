import * as vscode from "vscode";
import { QueryHistoryEntry, QueryHistoryStore } from "./queryHistoryStore";

/** Collapse a statement to a single line so it fits a tree label. */
export function summarizeSql(sql: string): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
}

/** Short "how long ago" label for the tree description. */
export function formatRelativeTime(executedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - executedAt) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(executedAt).toLocaleDateString();
}

/** Right-hand description: age, outcome, connection. */
export function formatEntryDescription(
  entry: QueryHistoryEntry,
  now: number
): string {
  const parts = [formatRelativeTime(entry.executedAt, now)];
  if (entry.error) {
    parts.push("failed");
  } else if (typeof entry.rowCount === "number") {
    parts.push(`${entry.rowCount.toLocaleString("en-US")} rows`);
  }
  if ((entry.runCount ?? 1) > 1) {
    parts.push(`×${entry.runCount}`);
  }
  parts.push(entry.connectionName);
  return parts.join(" · ");
}

export class QueryHistoryTreeItem extends vscode.TreeItem {
  constructor(readonly entry: QueryHistoryEntry, now: number) {
    super(summarizeSql(entry.sql), vscode.TreeItemCollapsibleState.None);
    this.id = entry.id;
    this.contextValue = "historyEntry";
    this.description = formatEntryDescription(entry, now);
    this.iconPath = new vscode.ThemeIcon(
      entry.error ? "error" : "history",
      entry.error ? new vscode.ThemeColor("errorForeground") : undefined
    );

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(
      `**${entry.connectionName}** (${entry.dialect}) — ${new Date(
        entry.executedAt
      ).toLocaleString()}\n\n`
    );
    tooltip.appendCodeblock(entry.sql, "sql");
    if (entry.truncated) {
      tooltip.appendMarkdown("\n_SQL truncated for storage._\n");
    }
    tooltip.appendMarkdown(
      entry.error
        ? `\n**Error:** ${entry.error}`
        : `\n${entry.durationMs} ms${
            typeof entry.rowCount === "number" ? ` · ${entry.rowCount} rows` : ""
          }`
    );
    this.tooltip = tooltip;

    // Opening an editor is the only safe click action: history holds DDL/DML too,
    // so re-running is an explicit context-menu choice.
    // Pass the id, not `this`: click arguments can cross the main-thread boundary
    // as a plain TreeItem DTO, which would drop the custom `entry` property.
    this.command = {
      command: "sqlStudio.openQueryFromHistory",
      title: "Open in Editor",
      arguments: [entry.id],
    };
  }
}

export class QueryHistoryProvider
  implements vscode.TreeDataProvider<QueryHistoryTreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: QueryHistoryStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: QueryHistoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: QueryHistoryTreeItem): QueryHistoryTreeItem[] {
    if (element) {
      return [];
    }
    const now = Date.now();
    return this.store.list().map((entry) => new QueryHistoryTreeItem(entry, now));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
