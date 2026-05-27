import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { PythonClient } from "../pythonClient";
import {
  ClickHouseInterface,
  ConnectionProfile,
  ConnectionWithSecret,
  Dialect,
  inferClickHouseInterface,
  secretKeyForConnection,
  toRpcConnection,
} from "../types";

export interface ConnectionFormPayload {
  id?: string;
  name: string;
  dialect: Dialect;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  readOnly: boolean;
  clickhouseInterface?: ClickHouseInterface;
}

export class ConnectionDialog {
  private panel: vscode.WebviewPanel | undefined;
  private pending: {
    resolve: (value: ConnectionWithSecret | undefined) => void;
  } | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly python?: PythonClient
  ) {}

  async open(existing?: ConnectionProfile): Promise<ConnectionWithSecret | undefined> {
    if (this.panel) {
      this.panel.reveal();
      return undefined;
    }

    return new Promise((resolve) => {
      this.pending = { resolve };

      const title = existing ? `Edit: ${existing.name}` : "New connection";
      this.panel = vscode.window.createWebviewPanel(
        "sqlStudioConnection",
        title,
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: false,
          localResourceRoots: [
            vscode.Uri.file(path.join(this.context.extensionPath, "dist")),
            vscode.Uri.file(
              path.join(this.context.extensionPath, "webview-ui", "dist")
            ),
          ],
        }
      );

      const panel = this.panel;
      panel.onDidDispose(() => {
        this.finish(undefined);
      });

      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "cancel") {
          this.finish(undefined);
          panel.dispose();
          return;
        }
        if (msg.type === "save") {
          const result = await this.buildConnectionFromPayload(
            msg.payload as ConnectionFormPayload,
            existing
          );
          if (result) {
            this.finish(result);
            panel.dispose();
          }
          return;
        }
        if (msg.type === "test") {
          await this.handleTest(panel, msg.payload as ConnectionFormPayload, existing);
        }
      });

      panel.webview.html = this.getHtml(panel.webview, existing);
    });
  }

  private finish(value: ConnectionWithSecret | undefined): void {
    const pending = this.pending;
    this.pending = undefined;
    this.panel = undefined;
    pending?.resolve(value);
  }

  private async buildConnectionFromPayload(
    payload: ConnectionFormPayload,
    existing?: ConnectionProfile
  ): Promise<ConnectionWithSecret | undefined> {
    let password = payload.password ?? "";
    if (existing && !password) {
      password =
        (await this.context.secrets.get(secretKeyForConnection(existing.id))) ?? "";
    }

    const profile: ConnectionProfile = {
      id: existing?.id ?? payload.id ?? crypto.randomUUID(),
      name: payload.name.trim(),
      dialect: payload.dialect,
      host: payload.host.trim(),
      port: payload.port,
      database: payload.database.trim() || "default",
      username: payload.username.trim(),
      ssl: payload.ssl,
      readOnly: payload.readOnly,
      clickhouseInterface:
        payload.dialect === "clickhouse"
          ? payload.clickhouseInterface ?? inferClickHouseInterface(payload.port)
          : undefined,
    };

    return { ...profile, password };
  }

  private async handleTest(
    panel: vscode.WebviewPanel,
    payload: ConnectionFormPayload,
    existing?: ConnectionProfile
  ): Promise<void> {
    if (!this.python) {
      panel.webview.postMessage({
        type: "testResult",
        ok: false,
        message: "Python backend is not available.",
      });
      return;
    }

    const conn = await this.buildConnectionFromPayload(payload, existing);
    if (!conn) {
      return;
    }

    try {
      await this.python.request(
        "connection/test",
        { connection: toRpcConnection(conn) },
        { timeoutMs: 20_000 }
      );
      await panel.webview.postMessage({
        type: "testResult",
        ok: true,
        message: `Connection to ${conn.host}:${conn.port} succeeded.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await panel.webview.postMessage({
        type: "testResult",
        ok: false,
        message: msg,
      });
    }
  }

  private getHtml(
    webview: vscode.Webview,
    existing?: ConnectionProfile
  ): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this.context.extensionPath,
          "webview-ui",
          "dist",
          "assets",
          "index.js"
        )
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this.context.extensionPath,
          "webview-ui",
          "dist",
          "assets",
          "index.css"
        )
      )
    );
    const nonce = String(Date.now());
    const init = {
      mode: existing ? "edit" : "create",
      profile: existing,
      hasStoredPassword: Boolean(existing),
    };
    const payload = JSON.stringify(init);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}">
  <title>Connection</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__SQL_STUDIO_MODE__ = "connection";
    window.__SQL_STUDIO_CONNECTION__ = ${payload};
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
