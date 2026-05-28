import * as path from "path";
import * as vscode from "vscode";
import { buildAccentColorStyleElement } from "../accentColors";
import type { SchemaDbmlPayload } from "../types";

export class ErDiagramPanel {
  private panel: vscode.WebviewPanel | undefined;

  show(
    context: vscode.ExtensionContext,
    title: string,
    payload: SchemaDbmlPayload
  ): void {
    if (this.panel) {
      this.panel.title = `ER: ${title}`;
      this.panel.webview.html = this.getHtml(context, this.panel.webview, payload);
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "sqlStudioErDiagram",
      `ER: ${title}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "dist")),
          vscode.Uri.file(path.join(context.extensionPath, "webview-ui", "dist")),
        ],
      }
    );

    const panel = this.panel;
    panel.webview.html = this.getHtml(context, panel.webview, payload);
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private getHtml(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    payload: SchemaDbmlPayload
  ): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(context.extensionPath, "webview-ui", "dist", "assets", "index.js")
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(context.extensionPath, "webview-ui", "dist", "assets", "index.css")
      )
    );
    const nonce = String(Date.now());
    const init = JSON.stringify(payload);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${buildAccentColorStyleElement()}
  <link rel="stylesheet" href="${styleUri}">
  <title>ER Diagram</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__SQL_STUDIO_MODE__ = "diagram";
    window.__SQL_STUDIO_DIAGRAM__ = ${init};
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
