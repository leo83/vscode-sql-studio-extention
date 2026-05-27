import * as vscode from "vscode";
import { ConnectionManager } from "./connectionManager";
import { PythonClient } from "./pythonClient";
import { ResultsPanel } from "./webview/resultsPanel";
import {
  buildPreviewSql,
  getPreviewRowLimit,
  getQueryRowLimit,
} from "./sqlUtils";
import {
  ConnectionWithSecret,
  QueryResultPayload,
  toRpcConnection,
} from "./types";

export class QueryRunner {
  private lastPreviewKey = "";
  private lastPreviewAt = 0;

  constructor(
    private readonly python: PythonClient,
    private readonly connections: ConnectionManager,
    private readonly results: ResultsPanel
  ) {}

  async runDocument(editor: vscode.TextEditor): Promise<void> {
    const sql = editor.document.getText();
    await this.runSql(sql, editor.document.fileName);
  }

  async runSelection(editor: vscode.TextEditor): Promise<void> {
    const selection = editor.selection;
    const sql = editor.document.getText(selection);
    if (!sql.trim()) {
      vscode.window.showWarningMessage("No SQL selected.");
      return;
    }
    await this.runSql(sql, editor.document.fileName);
  }

  async runSql(sql: string, title?: string): Promise<QueryResultPayload | undefined> {
    const conn = await this.connections.getActiveConnectionWithSecret();
    if (!conn) {
      const picked = await vscode.window.showWarningMessage(
        "No active connection. Add a connection first.",
        "Add Connection"
      );
      if (picked === "Add Connection") {
        await vscode.commands.executeCommand("sqlStudio.addConnection");
      }
      return undefined;
    }
    return this.executeWithConnection(
      conn,
      sql,
      title ?? conn.name,
      getQueryRowLimit()
    );
  }

  async previewTable(connectionId: string, qualifiedName: string): Promise<void> {
    const key = `${connectionId}:${qualifiedName}`;
    const now = Date.now();
    if (key === this.lastPreviewKey && now - this.lastPreviewAt < 400) {
      return;
    }
    this.lastPreviewKey = key;
    this.lastPreviewAt = now;

    const conn = await this.connections.getConnectionWithSecret(connectionId);
    if (!conn) {
      vscode.window.showErrorMessage("Connection not found.");
      return;
    }
    const limit = getPreviewRowLimit();
    const sql = buildPreviewSql(conn.dialect, qualifiedName, limit);
    await this.connections.setActiveConnectionId(connectionId);
    await this.executeWithConnection(
      conn,
      sql,
      `Preview: ${qualifiedName}`,
      limit
    );
  }

  private async executeWithConnection(
    conn: ConnectionWithSecret,
    sql: string,
    title: string,
    limit: number
  ): Promise<QueryResultPayload | undefined> {
    let result: QueryResultPayload | undefined;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Running on ${conn.name}...`,
        cancellable: false,
      },
      async () => {
        try {
          result = await this.python.request<QueryResultPayload>("query/execute", {
            connection: toRpcConnection(conn),
            sql,
            limit,
          });
          await this.results.show(result, title);
          if (result.truncated) {
            vscode.window.showInformationMessage(
              `Results truncated to ${limit} rows.`
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const errorResult: QueryResultPayload = {
            columns: [],
            rows: [],
            row_count: 0,
            duration_ms: 0,
            error: message,
          };
          await this.results.show(errorResult, `${title} (error)`);
          vscode.window.showErrorMessage(`Query failed: ${message}`);
        }
      }
    );
    return result;
  }
}
