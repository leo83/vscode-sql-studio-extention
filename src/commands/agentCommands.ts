import * as vscode from "vscode";
import { ConnectionManager } from "../connectionManager";
import { PythonClient } from "../pythonClient";
import { toRpcConnection } from "../types";

export async function formatActiveDocument(
  python: PythonClient,
  connections: ConnectionManager
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const conn = await connections.getActiveConnectionWithSecret();
  const dialect = conn?.dialect ?? "postgres";
  const sql = editor.document.getText();
  const result = await python.request<{ sql: string }>("sql/format", { sql, dialect });
  const fullRange = new vscode.Range(
    editor.document.positionAt(0),
    editor.document.positionAt(editor.document.getText().length)
  );
  await editor.edit((eb) => eb.replace(fullRange, result.sql));
}

export async function askAgentExplain(
  connections: ConnectionManager,
  python: PythonClient
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const sql = editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
  const conn = await connections.getActiveConnectionWithSecret();
  const dialect = conn?.dialect ?? "postgres";
  let schemaHint = "";
  if (conn) {
    try {
      const ddl = await python.request<{ ddl: string }>("schema/getTableDDL", {
        connection: toRpcConnection(conn),
        path: conn.dialect === "postgres" ? ["schemas", "public", ""] : ["databases", conn.database, ""],
      });
      if (ddl.ddl && !ddl.ddl.startsWith("--")) {
        schemaHint = `\n\nSchema context:\n${ddl.ddl}`;
      }
    } catch {
      // optional context
    }
  }
  const prompt = `Explain this ${dialect} SQL query. Describe what it does, tables involved, and performance considerations.\n\n\`\`\`sql\n${sql}\n\`\`\`${schemaHint}`;
  await vscode.env.clipboard.writeText(prompt);
  vscode.window.showInformationMessage(
    "Explain prompt copied to clipboard. Paste into Cursor Chat (Cmd+L)."
  );
}

export async function askAgentFix(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const sql = editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
  const prompt = `Review and optimize this SQL query. Fix syntax errors if any, suggest indexes, and return improved SQL with explanation.\n\n\`\`\`sql\n${sql}\n\`\`\``;
  await vscode.env.clipboard.writeText(prompt);
  vscode.window.showInformationMessage(
    "Fix/optimize prompt copied to clipboard. Paste into Cursor Chat (Cmd+L)."
  );
}
