import * as vscode from "vscode";
import { ConnectionManager } from "./connectionManager";
import { PythonClient } from "./pythonClient";
import { ResultsPanel } from "./webview/resultsPanel";
import {
  buildPreviewSql,
  getFetchMode,
  getLargeTableRowThreshold,
  getPreviewRowLimit,
  getQueryRowLimit,
  getServerPageSize,
  isLargeUnboundedSelectWarningEnabled,
  getSessionStatementsBeforeOffset,
  getStatementAtPosition,
  getStatementStartOffset,
  isSessionStatement,
  normalizeStatementSql,
} from "./sqlUtils";
import {
  ConnectionWithSecret,
  CheckUnboundedSelectPayload,
  QueryExecutePayload,
  toRpcConnection,
} from "./types";

export class QueryRunner {
  private lastPreviewKey = "";
  private lastPreviewAt = 0;
  private runningConnectionId: string | undefined;

  constructor(
    private readonly python: PythonClient,
    private readonly connections: ConnectionManager,
    private readonly results: ResultsPanel
  ) {}

  async runDocument(editor: vscode.TextEditor): Promise<void> {
    const sql = editor.document.getText();
    await this.runSql(sql, editor.document.fileName, {
      document: editor.document,
    });
  }

  async runAtCursor(editor: vscode.TextEditor): Promise<void> {
    if (!editor.selection.isEmpty) {
      const sql = editor.document.getText(editor.selection);
      if (!sql.trim()) {
        vscode.window.showWarningMessage("No SQL selected.");
        return;
      }
      await this.runSqlWithSessionContext(editor, sql, editor.selection.start);
      return;
    }

    const position = editor.selection.active;
    const sql = getStatementAtPosition(editor.document, position);
    if (!sql) {
      vscode.window.showWarningMessage(
        "No SQL at cursor. Move the cursor into a statement or select SQL text to run."
      );
      return;
    }

    const stmtStart = getStatementStartOffset(editor.document, position);
    const context =
      stmtStart !== undefined
        ? getSessionStatementsBeforeOffset(editor.document, stmtStart)
        : [];

    await this.runSqlWithSessionContext(
      editor,
      sql,
      stmtStart !== undefined
        ? editor.document.positionAt(stmtStart)
        : position,
      context
    );
  }

  async runSelection(editor: vscode.TextEditor): Promise<void> {
    const selection = editor.selection;
    const sql = editor.document.getText(selection);
    if (!sql.trim()) {
      vscode.window.showWarningMessage("No SQL selected.");
      return;
    }
    await this.runSqlWithSessionContext(editor, sql, selection.start);
  }

  private async runSqlWithSessionContext(
    editor: vscode.TextEditor,
    sql: string,
    anchor: vscode.Position,
    presetContext?: string[]
  ): Promise<void> {
    const trimmed = normalizeStatementSql(sql);
    if (!trimmed) {
      vscode.window.showWarningMessage("No SQL to run.");
      return;
    }
    const context =
      presetContext ?? getSessionStatementsBeforeOffset(editor.document, anchor);

    if (context.length > 0 && !isSessionStatement(trimmed)) {
      const batchSql = [...context, trimmed].join(";\n");
      await this.runSql(batchSql, editor.document.fileName, {
        document: editor.document,
        leadingSessionCount: context.length,
      });
      return;
    }

    await this.runSql(trimmed, editor.document.fileName, {
      document: editor.document,
    });
  }

  async runSql(
    sql: string,
    title?: string,
    options?: {
      showResults?: boolean;
      document?: vscode.TextDocument;
      connectionId?: string;
      leadingSessionCount?: number;
    }
  ): Promise<QueryExecutePayload | undefined> {
    let conn: ConnectionWithSecret | undefined;
    if (options?.connectionId) {
      conn = await this.connections.getConnectionWithSecret(options.connectionId);
    } else {
      const document = options?.document;
      const promptOnRun = vscode.workspace
        .getConfiguration("sqlStudio")
        .get<boolean>("promptForConnectionOnRun", false);

      if (promptOnRun && document) {
        const profile = await this.connections.promptSelectConnection({
          forDocumentUri: document.uri,
          title: "SQL Studio: Run on connection",
        });
        if (!profile) {
          return undefined;
        }
        conn = await this.connections.assignConnectionToDocument(
          document,
          profile.id
        );
      } else {
        conn = await this.connections.resolveConnectionForDocument(document, {
          promptIfMissing: true,
        });
      }
    }
    if (!conn) {
      await this.notifyNoConnectionSelected();
      return undefined;
    }
    if (!(await this.ensureActiveDatabaseConnection(conn))) {
      return undefined;
    }
    const fetchMode = getFetchMode();
    const limit = fetchMode === "server" ? getServerPageSize() : getQueryRowLimit();
    return this.executeWithConnection(
      conn,
      sql,
      title ?? conn.name,
      limit,
      options?.showResults !== false,
      options?.leadingSessionCount,
      fetchMode === "server" ? limit : undefined
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
    if (!(await this.ensureActiveDatabaseConnection(conn))) {
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

  async explainAtCursor(editor: vscode.TextEditor): Promise<void> {
    if (!editor.selection.isEmpty) {
      const sql = editor.document.getText(editor.selection);
      if (!sql.trim()) {
        vscode.window.showWarningMessage("No SQL selected.");
        return;
      }
      await this.explainSqlWithSessionContext(editor, sql, editor.selection.start);
      return;
    }

    const position = editor.selection.active;
    const sql = getStatementAtPosition(editor.document, position);
    if (!sql) {
      vscode.window.showWarningMessage(
        "No SQL at cursor. Move the cursor into a SELECT/WITH statement or select SQL text."
      );
      return;
    }

    const stmtStart = getStatementStartOffset(editor.document, position);
    const context =
      stmtStart !== undefined
        ? getSessionStatementsBeforeOffset(editor.document, stmtStart)
        : [];

    await this.explainSqlWithSessionContext(
      editor,
      sql,
      stmtStart !== undefined
        ? editor.document.positionAt(stmtStart)
        : position,
      context
    );
  }

  private async explainSqlWithSessionContext(
    editor: vscode.TextEditor,
    sql: string,
    anchor: vscode.Position,
    presetContext?: string[]
  ): Promise<void> {
    const trimmed = normalizeStatementSql(sql);
    if (!trimmed) {
      vscode.window.showWarningMessage("No SQL to explain.");
      return;
    }
    const context =
      presetContext ?? getSessionStatementsBeforeOffset(editor.document, anchor);

    if (context.length > 0 && !isSessionStatement(trimmed)) {
      const batchSql = [...context, trimmed].join(";\n");
      await this.explainSql(batchSql, editor.document.fileName, {
        document: editor.document,
      });
      return;
    }

    await this.explainSql(trimmed, editor.document.fileName, {
      document: editor.document,
    });
  }

  async explainSql(
    sql: string,
    title?: string,
    options?: {
      document?: vscode.TextDocument;
      connectionId?: string;
    }
  ): Promise<QueryExecutePayload | undefined> {
    let conn: ConnectionWithSecret | undefined;
    if (options?.connectionId) {
      conn = await this.connections.getConnectionWithSecret(options.connectionId);
    } else {
      const document = options?.document;
      const promptOnRun = vscode.workspace
        .getConfiguration("sqlStudio")
        .get<boolean>("promptForConnectionOnRun", false);

      if (promptOnRun && document) {
        const profile = await this.connections.promptSelectConnection({
          forDocumentUri: document.uri,
          title: "SQL Studio: Explain on connection",
        });
        if (!profile) {
          return undefined;
        }
        conn = await this.connections.assignConnectionToDocument(
          document,
          profile.id
        );
      } else {
        conn = await this.connections.resolveConnectionForDocument(document, {
          promptIfMissing: true,
        });
      }
    }
    if (!conn) {
      await this.notifyNoConnectionSelected();
      return undefined;
    }
    if (!(await this.ensureActiveDatabaseConnection(conn))) {
      return undefined;
    }

    const analyze = vscode.workspace
      .getConfiguration("sqlStudio")
      .get<boolean>("explainAnalyze", false);

    return this.explainWithConnection(
      conn,
      sql,
      title ?? conn.name,
      analyze && conn.dialect === "postgres"
    );
  }

  private async explainWithConnection(
    conn: ConnectionWithSecret,
    sql: string,
    title: string,
    analyze: boolean
  ): Promise<QueryExecutePayload | undefined> {
    const refreshCallback = async (): Promise<void> => {
      await this.explainWithConnection(conn, sql, title, analyze);
    };

    let result: QueryExecutePayload | undefined;
    let cancelled = false;
    this.runningConnectionId = conn.id;
    await vscode.commands.executeCommand("setContext", "sqlStudio.queryRunning", true);
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Execution plan on ${conn.name}...`,
          cancellable: true,
        },
        async (_progress, token) => {
          const explainPromise = this.python.request<QueryExecutePayload>("query/explain", {
            connection: toRpcConnection(conn),
            sql,
            limit: getQueryRowLimit(),
            analyze,
          });

          token.onCancellationRequested(() => {
            cancelled = true;
            void this.python
              .request("query/cancel", { connectionId: conn.id })
              .catch(() => undefined);
          });

          try {
            result = await explainPromise;
            await this.results.show(result, `Plan: ${title}`, undefined, undefined, refreshCallback);
          } catch (err) {
            if (cancelled || token.isCancellationRequested || this.isCancelledError(err)) {
              cancelled = true;
              return;
            }
            const message = err instanceof Error ? err.message : String(err);
            const errorResult: QueryExecutePayload = {
              statements: [
                {
                  index: 1,
                  sql,
                  columns: [],
                  rows: [],
                  row_count: 0,
                  duration_ms: 0,
                  error: message,
                },
              ],
              total_duration_ms: 0,
            };
            await this.results.show(errorResult, `Plan: ${title} (error)`, undefined, undefined, refreshCallback);
            vscode.window.showErrorMessage(`Execution plan failed: ${message}`);
          }
        }
      );
    } finally {
      this.runningConnectionId = undefined;
      await vscode.commands.executeCommand("setContext", "sqlStudio.queryRunning", false);
    }
    return result;
  }

  async cancelRunningQuery(): Promise<void> {
    const connectionId = this.runningConnectionId;
    if (!connectionId) {
      vscode.window.showInformationMessage("No query is running.");
      return;
    }
    try {
      await this.python.request("query/cancel", { connectionId });
    } catch {
      // Best-effort cancel; the in-flight request may already have finished.
    }
  }

  isQueryRunning(): boolean {
    return this.runningConnectionId !== undefined;
  }

  private trimLeadingSessionResults(
    result: QueryExecutePayload,
    leadingSessionCount: number
  ): QueryExecutePayload {
    if (result.statements.length <= leadingSessionCount) {
      return result;
    }
    const last = result.statements[result.statements.length - 1];
    return {
      statements: [last],
      total_duration_ms: last.duration_ms,
    };
  }

  private async executeWithConnection(
    conn: ConnectionWithSecret,
    sql: string,
    title: string,
    limit: number,
    showResults = true,
    leadingSessionCount = 0,
    serverPageSize?: number,
    isRefresh = false
  ): Promise<QueryExecutePayload | undefined> {
    const shouldRun = await this.confirmUnboundedLargeTableScan(conn, sql);
    if (!shouldRun) {
      return undefined;
    }

    const refreshCallback = async (): Promise<void> => {
      const currentFetchMode = getFetchMode();
      const currentLimit = currentFetchMode === "server" ? getServerPageSize() : getQueryRowLimit();
      await this.executeWithConnection(
        conn, sql, title, currentLimit, showResults, leadingSessionCount,
        currentFetchMode === "server" ? currentLimit : undefined,
        true
      );
    };

    // Re-run this query once with an explicit row limit (single-shot, client display).
    // Used by the "Increase limit" button; does not touch settings or the fetch mode.
    const rerunWithLimitCallback = async (
      newLimit: number
    ): Promise<QueryExecutePayload | undefined> => {
      return this.python.request<QueryExecutePayload>("query/execute", {
        connection: toRpcConnection(conn),
        sql,
        limit: newLimit,
      });
    };

    let result: QueryExecutePayload | undefined;
    let cancelled = false;
    this.runningConnectionId = conn.id;
    await vscode.commands.executeCommand("setContext", "sqlStudio.queryRunning", true);
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Running on ${conn.name}...`,
          cancellable: true,
        },
        async (progress, token) => {
          const startTime = Date.now();
          const timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            progress.report({ message: `${elapsed}s` });
          }, 1000);

          const executePromise = this.python.request<QueryExecutePayload>("query/execute", {
            connection: toRpcConnection(conn),
            sql,
            limit,
            ...(serverPageSize !== undefined ? { offset: 0 } : {}),
          });

          token.onCancellationRequested(() => {
            cancelled = true;
            void this.python
              .request("query/cancel", { connectionId: conn.id })
              .catch(() => undefined);
          });

          try {
            result = await executePromise;
            if (leadingSessionCount > 0) {
              result = this.trimLeadingSessionResults(result, leadingSessionCount);
            }
            const isServerMode =
              serverPageSize !== undefined &&
              result.statements.length === 1 &&
              !result.statements[0].error;
            if (isServerMode) {
              result = { ...result, fetch_mode: "server", server_page_size: serverPageSize };
              const maxOffset = getQueryRowLimit();
              const fetchPageCallback = async (
                offset: number,
                limit?: number
              ): Promise<QueryExecutePayload | undefined> => {
                if (offset >= maxOffset) {
                  return undefined;
                }
                return this.python.request<QueryExecutePayload>("query/execute", {
                  connection: toRpcConnection(conn),
                  sql,
                  limit: limit ?? serverPageSize,
                  offset,
                });
              };
              const loadAllCallback = async (): Promise<QueryExecutePayload | undefined> => {
                return this.python.request<QueryExecutePayload>("query/execute", {
                  connection: toRpcConnection(conn),
                  sql,
                  limit: getQueryRowLimit(),
                });
              };
              if (showResults) {
                await this.results.show(result, title, fetchPageCallback, loadAllCallback, refreshCallback, rerunWithLimitCallback, { reuse: isRefresh });
              }
            } else {
              if (showResults) {
                await this.results.show(result, title, undefined, undefined, refreshCallback, rerunWithLimitCallback, { reuse: isRefresh });
              }
              const truncated = result.statements.some((s) => s.truncated);
              if (truncated) {
                vscode.window.showInformationMessage(
                  `Results truncated to ${limit} rows.`
                );
              }
            }
          } catch (err) {
            if (cancelled || token.isCancellationRequested || this.isCancelledError(err)) {
              cancelled = true;
              return;
            }
            const message = err instanceof Error ? err.message : String(err);
            const errorResult: QueryExecutePayload = {
              statements: [
                {
                  index: 1,
                  sql,
                  columns: [],
                  rows: [],
                  row_count: 0,
                  duration_ms: 0,
                  error: message,
                },
              ],
              total_duration_ms: 0,
            };
            if (showResults) {
              await this.results.show(errorResult, `${title} (error)`, undefined, undefined, refreshCallback);
            }
            vscode.window.showErrorMessage(`Query failed: ${message}`);
          } finally {
            clearInterval(timerInterval);
          }
        }
      );
    } finally {
      this.runningConnectionId = undefined;
      await vscode.commands.executeCommand("setContext", "sqlStudio.queryRunning", false);
    }
    return result;
  }

  private async notifyNoConnectionSelected(): Promise<void> {
    const picked = await vscode.window.showWarningMessage(
      "No database connection selected.",
      "Select Connection"
    );
    if (picked === "Select Connection") {
      await vscode.commands.executeCommand("sqlStudio.selectConnection");
    }
  }

  private async ensureActiveDatabaseConnection(
    conn: ConnectionWithSecret
  ): Promise<boolean> {
    if (this.connections.isDatabaseConnectionActive(conn.id)) {
      return true;
    }
    const picked = await vscode.window.showWarningMessage(
      `Connection "${conn.name}" is not active.`,
      "Connect",
      "Cancel"
    );
    if (picked !== "Connect") {
      return false;
    }
    return this.connections.connectToDatabase(conn.id);
  }

  private isCancelledError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return /cancel/i.test(message);
  }

  private async confirmUnboundedLargeTableScan(
    conn: ConnectionWithSecret,
    sql: string
  ): Promise<boolean> {
    if (!isLargeUnboundedSelectWarningEnabled()) {
      return true;
    }

    try {
      const check = await this.python.request<CheckUnboundedSelectPayload>(
        "sql/checkUnboundedSelect",
        {
          connection: toRpcConnection(conn),
          sql,
          threshold: getLargeTableRowThreshold(),
        }
      );
      if (check.warnings.length === 0) {
        return true;
      }

      const detail = check.warnings.map((warning) => warning.message).join("\n");
      const picked = await vscode.window.showWarningMessage(
        `Unbounded SELECT without WHERE may scan large tables:\n${detail}`,
        { modal: true },
        "Run anyway"
      );
      return picked === "Run anyway";
    } catch {
      return true;
    }
  }
}
