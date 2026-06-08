import * as vscode from "vscode";
import * as path from "path";
import { buildAccentColorStyleElement } from "../accentColors";
import { PythonClient } from "../pythonClient";
import { lastExportableStatement, QueryExecutePayload } from "../types";

export class ResultsPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private lastResult: QueryExecutePayload | undefined;
  private pendingTitle: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly python: PythonClient
  ) {}

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
          await this.handleExport(msg.type === "exportCsv" ? "csv" : "xlsx");
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

  async show(result: QueryExecutePayload, title: string): Promise<void> {
    this.lastResult = result;
    this.pendingTitle = `Results: ${title}`;

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

  private async handleExport(kind: "csv" | "xlsx"): Promise<void> {
    if (!this.lastResult) {
      return;
    }
    const ext = kind === "csv" ? "csv" : "xlsx";
    const uri = await vscode.window.showSaveDialog({
      filters: { [ext.toUpperCase()]: [ext] },
    });
    if (!uri) {
      return;
    }
    const exportable = lastExportableStatement(this.lastResult);
    if (!exportable) {
      vscode.window.showWarningMessage("No tabular results to export.");
      return;
    }
    const columns = exportable.columns.map((c) => c.name);
    const method = kind === "csv" ? "export/csv" : "export/xlsx";
    const params: Record<string, unknown> = {
      path: uri.fsPath,
      columns,
      rows: exportable.rows,
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
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
