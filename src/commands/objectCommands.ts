import * as vscode from "vscode";
import { ConnectionManager } from "../connectionManager";
import { PythonClient } from "../pythonClient";
import { ExplorerTreeItem } from "../schemaExplorer/treeProvider";
import {
  buildPreviewSql,
  getPreviewRowLimit,
  getQueryRowLimit,
} from "../sqlUtils";
import { ObjectDescriptionPanel } from "../webview/objectDescriptionPanel";
import {
  ConnectionProfile,
  ConnectionWithSecret,
  Dialect,
  lastExportableStatement,
  ObjectDescriptionPayload,
  QueryExecutePayload,
  toRpcConnection,
} from "../types";
import { createSqlQuery } from "./createSqlQuery";

const descriptionPanel = new ObjectDescriptionPanel();

function languageForDialect(dialect: Dialect): string {
  return dialect === "clickhouse" ? "sql-studio-clickhouse" : "sql-studio-postgres";
}

function isDataObject(item: ExplorerTreeItem): boolean {
  return (
    item.itemType === "table" ||
    item.itemType === "view"
  );
}

function defaultQueryForObject(
  item: ExplorerTreeItem,
  profile: ConnectionProfile
): string | undefined {
  const qn = item.qualifiedName;
  if (!qn) {
    return undefined;
  }

  if (item.itemType === "table" || item.itemType === "view") {
    return [
      `-- ${item.itemType}: ${qn}`,
      "",
      buildPreviewSql(profile.dialect, qn, 100),
      "",
    ].join("\n");
  }

  if (item.itemType === "function") {
    const parts = qn.split(".");
    if (parts.length !== 2) {
      return undefined;
    }
    const [schema, name] = parts;
    if (profile.dialect === "postgres") {
      return [
        `-- function: ${qn}`,
        "",
        `SELECT * FROM ${schema}.${name}();`,
        "",
      ].join("\n");
    }
    return [`-- function: ${qn}`, "", `SELECT ${qn}()`, ""].join("\n");
  }

  if (item.itemType === "procedure") {
    const parts = qn.split(".");
    if (parts.length !== 2) {
      return undefined;
    }
    const [schema, name] = parts;
    if (profile.dialect === "postgres") {
      return [
        `-- procedure: ${qn}`,
        "",
        `CALL ${schema}.${name}();`,
        "",
      ].join("\n");
    }
    return undefined;
  }

  return undefined;
}

async function resolveItemConnection(
  connections: ConnectionManager,
  item: ExplorerTreeItem
): Promise<{ conn: ConnectionWithSecret; profile: ConnectionProfile } | undefined> {
  if (!item.connectionId || !item.node?.path) {
    return undefined;
  }
  const conn = await connections.getConnectionWithSecret(item.connectionId);
  const profile = connections.getProfile(item.connectionId);
  if (!conn || !profile) {
    vscode.window.showErrorMessage("Connection not found.");
    return undefined;
  }
  return { conn, profile };
}

export async function showObjectDescription(
  connections: ConnectionManager,
  python: PythonClient,
  item: ExplorerTreeItem
): Promise<void> {
  const resolved = await resolveItemConnection(connections, item);
  if (!resolved) {
    return;
  }

  try {
    const description = await python.request<ObjectDescriptionPayload>(
      "schema/getObjectDescription",
      {
        connection: toRpcConnection(resolved.conn),
        path: item.node?.path ?? [],
      }
    );
    descriptionPanel.show(description);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Object description failed: ${msg}`);
  }
}

export async function sampleObjectData(
  queryRunner: { previewTable: (connectionId: string, qualifiedName: string) => Promise<void> },
  item: ExplorerTreeItem
): Promise<void> {
  if (!isDataObject(item) || !item.connectionId || !item.qualifiedName) {
    vscode.window.showWarningMessage("Sample data is available for tables and views.");
    return;
  }
  await queryRunner.previewTable(item.connectionId, item.qualifiedName);
}

export async function exportObjectData(
  connections: ConnectionManager,
  python: PythonClient,
  item: ExplorerTreeItem
): Promise<void> {
  if (!isDataObject(item)) {
    vscode.window.showWarningMessage("Export is available for tables and views.");
    return;
  }

  const resolved = await resolveItemConnection(connections, item);
  if (!resolved || !item.qualifiedName) {
    return;
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${item.qualifiedName.replace(/\./g, "_")}.csv`),
    filters: { CSV: ["csv"] },
  });
  if (!uri) {
    return;
  }

  const limit = getQueryRowLimit();
  const sql = buildPreviewSql(resolved.profile.dialect, item.qualifiedName, limit);

  try {
    const result = await python.request<QueryExecutePayload>("query/execute", {
      connection: toRpcConnection(resolved.conn),
      sql,
      limit,
    });
    const exportable = lastExportableStatement(result);
    if (!exportable) {
      vscode.window.showWarningMessage("No data to export.");
      return;
    }
    await python.request("export/csv", {
      path: uri.fsPath,
      columns: exportable.columns.map((c) => c.name),
      rows: exportable.rows,
      bom: true,
    });
    const truncated = exportable.truncated ? ` (truncated to ${limit} rows)` : "";
    vscode.window.showInformationMessage(`Exported to ${uri.fsPath}${truncated}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Export failed: ${msg}`);
  }
}

export async function createSqlQueryForObject(
  connections: ConnectionManager,
  item: ExplorerTreeItem
): Promise<void> {
  if (!item.connectionId) {
    await createSqlQuery(connections);
    return;
  }

  const profile = connections.getProfile(item.connectionId);
  if (!profile) {
    vscode.window.showErrorMessage("Connection not found.");
    return;
  }

  const content = defaultQueryForObject(item, profile);
  if (!content) {
    await createSqlQuery(connections, item.connectionId);
    return;
  }

  const doc = await vscode.workspace.openTextDocument({
    content,
    language: languageForDialect(profile.dialect),
  });
  await connections.assignConnectionToDocument(doc, profile.id);
  await vscode.window.showTextDocument(doc, { preview: false });
}

export function getSampleRowLimit(): number {
  return getPreviewRowLimit();
}
