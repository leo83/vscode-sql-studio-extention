import * as vscode from "vscode";
import * as path from "path";
import { buildAccentColorStyleElement } from "../accentColors";
import { PythonClient } from "../pythonClient";
import { TableLayout, TableLayoutStore } from "../tableLayoutStore";
import { lastExportableStatement, QueryExecutePayload } from "../types";

export class ResultsPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private readonly layoutStore: TableLayoutStore;
  private lastResult: QueryExecutePayload | undefined;
  private pendingTitle: string | undefined;
  private fetchPageCallback:
    | ((offset: number, limit?: number) => Promise<QueryExecutePayload | undefined>)
    | undefined;
  private loadAllCallback: (() => Promise<QueryExecutePayload | undefined>) | undefined;
  private rerunWithLimitCallback:
    | ((limit: number) => Promise<QueryExecutePayload | undefined>)
    | undefined;
  private refreshCallback: ((opts?: { loadAll?: boolean }) => Promise<void>) | undefined;
  private isRefreshing = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly python: PythonClient
  ) {
    this.layoutStore = new TableLayoutStore(context);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, "dist")),
        vscode.Uri.file(path.join(this.context.extensionPath, "webview-ui", "dist")),
      ],
    };
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "exportCsv" || msg.type === "exportXlsx") {
        try {
          await this.handleExport(
            msg.type === "exportCsv" ? "csv" : "xlsx",
            Array.isArray(msg.columns) ? (msg.columns as string[]) : undefined,
            Array.isArray(msg.rows) ? (msg.rows as unknown[][]) : undefined
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Export failed: ${message}`);
        }
      } else if (msg.type === "copyError") {
        try {
          await vscode.env.clipboard.writeText(msg.text);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to copy to clipboard: ${message}`);
        }
      } else if (msg.type === "openUrl") {
        try {
          const uri = vscode.Uri.parse(msg.url as string, true);
          if (uri.scheme === "http" || uri.scheme === "https") {
            await vscode.env.openExternal(uri);
          }
        } catch {
          // ignore malformed URLs
        }
      } else if (msg.type === "saveTableLayout") {
        if (typeof msg.hash === "string" && msg.layout) {
          await this.layoutStore.save(msg.hash, msg.layout as TableLayout);
        }
      } else if (msg.type === "resetTableLayout") {
        if (typeof msg.hash === "string") {
          await this.layoutStore.reset(msg.hash);
        }
      } else if (msg.type === "fetchPage") {
        const offset = msg.offset as number;
        const limit = msg.limit as number | undefined;
        if (this.fetchPageCallback && this.view) {
          try {
            const pageResult = await this.fetchPageCallback(offset, limit);
            if (pageResult && this.view) {
              const newPageSize = limit ?? this.lastResult?.server_page_size;
              if (limit && this.lastResult) {
                this.lastResult = { ...this.lastResult, server_page_size: limit };
              }
              const enriched: QueryExecutePayload = {
                ...pageResult,
                fetch_mode: this.lastResult?.fetch_mode,
                server_page_size: newPageSize,
              };
              this.view.webview.postMessage({ type: "pageData", result: enriched });
            }
          } catch {
            // page fetch failed silently
          }
        }
      } else if (msg.type === "refresh") {
        if (this.refreshCallback && !this.isRefreshing) {
          this.isRefreshing = true;
          void this.refreshCallback({ loadAll: msg.loadAll === true }).finally(() => {
            this.isRefreshing = false;
          });
        }
      } else if (msg.type === "loadAll") {
        const permanently = msg.permanently as boolean;
        if (permanently) {
          await vscode.workspace
            .getConfiguration("sqlStudio")
            .update("fetchMode", "client", vscode.ConfigurationTarget.Global);
        }
        if (this.loadAllCallback && this.view) {
          const callback = this.loadAllCallback;
          try {
            const fullResult = await vscode.window.withProgress(
              { location: vscode.ProgressLocation.Notification, title: "Loading all rows…", cancellable: false },
              () => callback()
            );
            if (fullResult && this.view) {
              this.lastResult = fullResult;
              this.fetchPageCallback = undefined;
              this.loadAllCallback = undefined;
              this.view.webview.postMessage({ type: "pageData", result: fullResult });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to load all rows: ${message}`);
          }
        }
      } else if (msg.type === "changeLimit") {
        if (!this.rerunWithLimitCallback || !this.view) return;
        // "All" maps to a practically-unbounded limit (still capped to avoid runaway loads).
        const ALL_ROWS_LIMIT = 100_000_000;
        const options = [
          { label: "10 000 rows", limit: 10000 },
          { label: "25 000 rows", limit: 25000 },
          { label: "50 000 rows", limit: 50000 },
          { label: "100 000 rows", limit: 100000 },
          { label: "500 000 rows", limit: 500000 },
          { label: "1 000 000 rows", limit: 1000000 },
          { label: "All rows", limit: ALL_ROWS_LIMIT },
        ];
        const selection = await vscode.window.showQuickPick(
          options.map((o) => o.label),
          { placeHolder: "How many rows to load?" }
        );
        if (!selection) return;
        const chosen = options.find((o) => o.label === selection);
        if (!chosen) return;
        const callback = this.rerunWithLimitCallback;
        try {
          const fullResult = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title:
                chosen.limit === ALL_ROWS_LIMIT
                  ? "Loading all rows…"
                  : `Loading up to ${chosen.limit.toLocaleString("en-US")} rows…`,
              cancellable: false,
            },
            () => callback(chosen.limit)
          );
          if (fullResult && this.view) {
            this.lastResult = fullResult;
            this.fetchPageCallback = undefined;
            this.loadAllCallback = undefined;
            this.view.webview.postMessage({ type: "pageData", result: fullResult });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to load rows: ${message}`);
        }
      }
    });
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    if (this.lastResult) {
      webviewView.title = this.pendingTitle ?? "Query Results";
      webviewView.webview.html = this.getHtml(webviewView.webview, this.lastResult);
    }
  }

  async show(
    result: QueryExecutePayload,
    title: string,
    onFetchPage?: (offset: number) => Promise<QueryExecutePayload | undefined>,
    onLoadAll?: () => Promise<QueryExecutePayload | undefined>,
    onRefresh?: () => Promise<void>,
    onRerunWithLimit?: (limit: number) => Promise<QueryExecutePayload | undefined>,
    options?: { reuse?: boolean }
  ): Promise<void> {
    this.lastResult = result;
    this.pendingTitle = `Results: ${title}`;
    this.fetchPageCallback = onFetchPage;
    this.loadAllCallback = onLoadAll;
    this.rerunWithLimitCallback = onRerunWithLimit;
    this.refreshCallback = onRefresh;
    this.isRefreshing = false;

    // Refresh of the same query: keep the existing webview mounted so front-end
    // state (filters, view mode, sorting) survives. Push fresh data and reset the
    // page cache instead of rebuilding the HTML (which would remount React).
    if (options?.reuse && this.view) {
      this.view.title = this.pendingTitle;
      this.view.show?.(true);
      this.view.webview.postMessage({ type: "pageData", result, reset: true });
      return;
    }

    await vscode.commands.executeCommand("sqlStudio.results.focus");

    if (this.view) {
      this.view.title = this.pendingTitle;
      this.view.show?.(true);
      this.view.webview.html = this.getHtml(this.view.webview, result);
    }
  }

  getLastResult(): QueryExecutePayload | undefined {
    return this.lastResult;
  }

  refreshAccentStyles(): void {
    if (this.view && this.lastResult) {
      this.view.webview.html = this.getHtml(this.view.webview, this.lastResult);
    }
  }

  private async handleExport(
    kind: "csv" | "xlsx",
    columnsOverride?: string[],
    rowsOverride?: unknown[][]
  ): Promise<void> {
    if (!this.lastResult) {
      return;
    }
    // The webview supplies the columns/rows as currently displayed — filtered,
    // sorted, with hidden columns dropped and reordered columns applied. When that
    // payload is absent (e.g. an older webview), fall back to the raw last result.
    let columns: string[];
    let rows: unknown[][];
    if (columnsOverride && rowsOverride) {
      columns = columnsOverride;
      rows = rowsOverride;
    } else {
      const exportable = lastExportableStatement(this.lastResult);
      if (!exportable) {
        vscode.window.showWarningMessage("No tabular results to export.");
        return;
      }
      columns = exportable.columns.map((c) => c.name);
      rows = exportable.rows;
    }
    if (columns.length === 0) {
      vscode.window.showWarningMessage("No visible columns to export.");
      return;
    }
    const ext = kind === "csv" ? "csv" : "xlsx";
    const uri = await vscode.window.showSaveDialog({
      filters: { [ext.toUpperCase()]: [ext] },
    });
    if (!uri) {
      return;
    }
    const method = kind === "csv" ? "export/csv" : "export/xlsx";
    const params: Record<string, unknown> = {
      path: uri.fsPath,
      columns,
      rows,
    };
    if (kind === "csv") {
      params.bom = true;
    }
    await this.python.request(method, params);
    vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
  }

  private getHtml(webview: vscode.Webview, result: QueryExecutePayload): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.context.extensionPath, "webview-ui", "dist", "assets", "index.js")
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.context.extensionPath, "webview-ui", "dist", "assets", "index.css")
      )
    );
    const nonce = String(Date.now());
    const payload = JSON.stringify(result).replace(/</g, "\\u003c");
    const layouts = JSON.stringify(this.layoutStore.getAll()).replace(/</g, "\\u003c");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${buildAccentColorStyleElement()}
  <link rel="stylesheet" href="${styleUri}">
  <title>SQL Results</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__SQL_STUDIO_RESULT__ = ${payload};
    window.__SQL_STUDIO_TABLE_LAYOUTS__ = ${layouts};
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
