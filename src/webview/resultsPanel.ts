import * as vscode from "vscode";
import * as path from "path";
import { PythonClient } from "../pythonClient";
import { QueryResultPayload } from "../types";

export class ResultsPanel {
  private panel: vscode.WebviewPanel | undefined;
  private lastResult: QueryResultPayload | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly python: PythonClient
  ) {}

  async show(result: QueryResultPayload, title: string): Promise<void> {
    this.lastResult = result;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "sqlStudioResults",
        "SQL Results",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(this.context.extensionPath, "dist")),
            vscode.Uri.file(path.join(this.context.extensionPath, "webview-ui", "dist")),
          ],
        }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
      this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "exportCsv" || msg.type === "exportXlsx") {
          await this.handleExport(msg.type === "exportCsv" ? "csv" : "xlsx");
        }
      });
    }
    this.panel.title = `Results: ${title}`;
    this.panel.webview.html = this.getHtml(this.panel.webview, result);
  }

  getLastResult(): QueryResultPayload | undefined {
    return this.lastResult;
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
    const columns = this.lastResult.columns.map((c) => c.name);
    const method = kind === "csv" ? "export/csv" : "export/xlsx";
    await this.python.request(method, {
      path: uri.fsPath,
      columns,
      rows: this.lastResult.rows,
      bom: true,
    });
    vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
  }

  private getHtml(webview: vscode.Webview, result: QueryResultPayload): string {
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
    const payload = JSON.stringify(result);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
