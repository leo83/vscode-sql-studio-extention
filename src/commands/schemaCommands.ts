import * as vscode from "vscode";
import { ConnectionManager } from "../connectionManager";
import { ErDiagramPanel } from "../webview/erDiagramPanel";
import { PythonClient } from "../pythonClient";
import { ExplorerTreeItem } from "../schemaExplorer/treeProvider";
import { SchemaDbmlPayload, toRpcConnection } from "../types";

const diagramPanel = new ErDiagramPanel();

function isSchemaScopeItem(item: ExplorerTreeItem): boolean {
  return item.itemType === "schema" || item.itemType === "database";
}

async function fetchSchemaDbml(
  connections: ConnectionManager,
  python: PythonClient,
  item: ExplorerTreeItem
): Promise<SchemaDbmlPayload | undefined> {
  if (!isSchemaScopeItem(item) || !item.connectionId || !item.node?.path) {
    vscode.window.showWarningMessage(
      "Open ER diagram or DBML from a schema (PostgreSQL) or database (ClickHouse) node."
    );
    return undefined;
  }

  const conn = await connections.getConnectionWithSecret(item.connectionId);
  if (!conn) {
    vscode.window.showErrorMessage("Connection not found.");
    return undefined;
  }

  return python.request<SchemaDbmlPayload>("schema/getDbml", {
    connection: toRpcConnection(conn),
    path: item.node.path,
  });
}

export async function showSchemaDiagram(
  context: vscode.ExtensionContext,
  connections: ConnectionManager,
  python: PythonClient,
  item: ExplorerTreeItem
): Promise<void> {
  try {
    const payload = await fetchSchemaDbml(connections, python, item);
    if (!payload) {
      return;
    }
    const profile = connections.getProfile(item.connectionId!);
    const title = profile
      ? `${profile.name} — ${payload.scope}`
      : payload.scope;
    diagramPanel.show(context, title, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Schema diagram failed: ${msg}`);
  }
}

export async function getSchemaDbml(
  connections: ConnectionManager,
  python: PythonClient,
  item: ExplorerTreeItem
): Promise<void> {
  try {
    const payload = await fetchSchemaDbml(connections, python, item);
    if (!payload) {
      return;
    }
    const profile = connections.getProfile(item.connectionId!);
    const doc = await vscode.workspace.openTextDocument({
      content: payload.dbml,
      language: "plaintext",
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    const copy = "Copy to clipboard";
    const picked = await vscode.window.showInformationMessage(
      `DBML for ${profile?.name ?? "connection"} / ${payload.scope}: ` +
        `${payload.table_count} tables, ${payload.relationship_count} relationships.`,
      copy
    );
    if (picked === copy) {
      await vscode.env.clipboard.writeText(payload.dbml);
      vscode.window.showInformationMessage("DBML copied to clipboard.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`DBML export failed: ${msg}`);
  }
}
