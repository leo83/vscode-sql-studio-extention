import * as vscode from "vscode";
import { ConnectionManager } from "./connectionManager";
import { isSqlStudioEditor } from "./sqlDocument";

export class ConnectionStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly connections: ConnectionManager) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = "sqlStudio.selectConnection";
    this.disposables.push(this.item);

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.workspace.onDidCloseTextDocument(() => this.refresh())
    );
    this.refresh();
  }

  refresh(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isSqlStudioEditor(editor)) {
      this.item.hide();
      return;
    }

    const docId = this.connections.getDocumentConnectionId(editor.document.uri);
    const activeId = this.connections.getActiveConnectionId();
    const connId = docId ?? activeId;
    const profile = connId ? this.connections.getProfile(connId) : undefined;

    if (profile) {
      const scope = docId ? "file" : "workspace";
      this.item.text = `$(database) ${profile.name} (${profile.dialect})`;
      this.item.tooltip = `SQL Studio connection (${scope}). Click to change.`;
    } else {
      this.item.text = "$(database) Select connection";
      this.item.tooltip = "Choose a database connection for this SQL file";
    }
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
