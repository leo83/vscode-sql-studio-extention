import * as vscode from "vscode";
import { ConnectionManager } from "../connectionManager";
import { QueryHistoryEntry, QueryHistoryStore } from "../queryHistoryStore";
import { QueryHistoryTreeItem, summarizeSql } from "../queryHistoryView";
import { QueryRunner } from "../queryRunner";
import { languageForDialect, Dialect } from "../types";

/** What the history commands accept: a tree item, a bare entry, or an entry id. */
export type HistoryTarget =
  | QueryHistoryTreeItem
  | QueryHistoryEntry
  | string
  | undefined;

/**
 * Resolve a command argument to an entry. The context menu hands over the tree
 * item itself, the quick pick a bare entry, and a row click only an id — a click
 * argument may be marshalled into a plain TreeItem DTO, so it cannot carry the
 * entry along.
 */
function toEntry(
  store: QueryHistoryStore,
  target: HistoryTarget
): QueryHistoryEntry | undefined {
  if (!target) {
    return undefined;
  }
  if (typeof target === "string") {
    return store.get(target);
  }
  if (target instanceof QueryHistoryTreeItem) {
    return target.entry;
  }
  return target;
}

/**
 * Open the recorded SQL in a new untitled editor bound to the connection it ran
 * on, when that connection still exists.
 */
export async function openQueryFromHistory(
  connections: ConnectionManager,
  store: QueryHistoryStore,
  target: HistoryTarget
): Promise<void> {
  const entry = toEntry(store, target);
  if (!entry) {
    return;
  }
  const profile = connections.getProfile(entry.connectionId);
  const doc = await vscode.workspace.openTextDocument({
    content: `${entry.sql}\n`,
    language: languageForDialect(
      (profile?.dialect ?? entry.dialect) as Dialect
    ),
  });
  if (profile) {
    await connections.assignConnectionToDocument(doc, profile.id);
  }
  await vscode.window.showTextDocument(doc, { preview: false });
  if (!profile) {
    vscode.window.showWarningMessage(
      `Connection "${entry.connectionName}" no longer exists — select a connection before running.`
    );
  }
}

/** Re-run a recorded query on its original connection, after confirmation. */
export async function runQueryFromHistory(
  connections: ConnectionManager,
  store: QueryHistoryStore,
  runner: QueryRunner,
  target: HistoryTarget
): Promise<void> {
  const entry = toEntry(store, target);
  if (!entry) {
    return;
  }
  const profile = connections.getProfile(entry.connectionId);
  if (!profile) {
    vscode.window.showWarningMessage(
      `Connection "${entry.connectionName}" no longer exists. Open the query in an editor and pick a connection.`
    );
    await openQueryFromHistory(connections, store, entry);
    return;
  }
  // History can hold DDL/DML, so never re-execute without an explicit yes.
  const confirmed = await vscode.window.showWarningMessage(
    `Run this query on "${profile.name}"?`,
    { modal: true, detail: summarizeSql(entry.sql) },
    "Run"
  );
  if (confirmed !== "Run") {
    return;
  }
  await runner.runSql(entry.sql, `History: ${profile.name}`, {
    connectionId: profile.id,
  });
}

export async function copyQueryFromHistory(
  store: QueryHistoryStore,
  target: HistoryTarget
): Promise<void> {
  const entry = toEntry(store, target);
  if (!entry) {
    return;
  }
  await vscode.env.clipboard.writeText(entry.sql);
  vscode.window.showInformationMessage("Query copied to clipboard.");
}

export async function deleteQueryFromHistory(
  store: QueryHistoryStore,
  target: HistoryTarget
): Promise<void> {
  const entry = toEntry(store, target);
  if (!entry) {
    return;
  }
  await store.remove(entry.id);
}

export async function clearQueryHistory(
  store: QueryHistoryStore
): Promise<void> {
  if (store.list().length === 0) {
    vscode.window.showInformationMessage("Query history is already empty.");
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    "Clear the whole query history?",
    { modal: true },
    "Clear"
  );
  if (confirmed === "Clear") {
    await store.clear();
  }
}

/** Searchable picker over the history — the keyboard path into the same list. */
export async function searchQueryHistory(
  connections: ConnectionManager,
  store: QueryHistoryStore
): Promise<void> {
  const entries = store.list();
  if (entries.length === 0) {
    vscode.window.showInformationMessage("Query history is empty.");
    return;
  }
  const picked = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: `${entry.error ? "$(error)" : "$(history)"} ${summarizeSql(entry.sql)}`,
      description: `${entry.connectionName} · ${new Date(
        entry.executedAt
      ).toLocaleString()}`,
      detail: entry.error ?? undefined,
      entry,
    })),
    {
      title: "SQL Studio: Query History",
      placeHolder: "Search executed queries — pick one to open it in an editor",
      matchOnDescription: true,
    }
  );
  if (picked) {
    await openQueryFromHistory(connections, store, picked.entry);
  }
}
