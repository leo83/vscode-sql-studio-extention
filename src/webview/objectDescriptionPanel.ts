import * as vscode from "vscode";
import type { ObjectDescriptionPayload } from "../types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "<p class=\"muted\">No data</p>";
  }
  const headers = Object.keys(rows[0]);
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = headers
        .map((h) => `<td>${escapeHtml(String(row[h] ?? ""))}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderColumns(description: ObjectDescriptionPayload): string {
  if (description.columns.length === 0) {
    return "";
  }
  const rows = description.columns.map((col) => ({
    Column: col.name,
    Type: col.data_type,
    Nullable: col.nullable ? "YES" : "NO",
    "Primary key": col.is_primary_key ? "YES" : "",
    Default: col.default ?? "",
    Comment: col.comment ?? "",
  }));
  return `<section><h2>Columns</h2>${renderTable(rows)}</section>`;
}

function buildHtml(description: ObjectDescriptionPayload): string {
  const title = `${description.object_type}: ${description.qualified_name}`;
  const sections = description.sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2>${renderTable(section.rows)}</section>`
    )
    .join("");
  const ddl = description.ddl
    ? `<section><h2>Definition</h2><pre><code>${escapeHtml(description.ddl)}</code></pre></section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px 20px;
      line-height: 1.5;
    }
    h1 { font-size: 1.2rem; margin: 0 0 16px; font-weight: 600; }
    h2 { font-size: 0.95rem; margin: 20px 0 8px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td {
      border: 1px solid var(--vscode-panel-border, #444);
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: var(--vscode-editor-inactiveSelectionBackground); }
    pre {
      overflow: auto;
      padding: 12px;
      border: 1px solid var(--vscode-panel-border, #444);
      background: var(--vscode-textBlockQuote-background, #111);
      font-size: 0.82rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .muted { opacity: 0.7; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${sections}
  ${renderColumns(description)}
  ${ddl}
</body>
</html>`;
}

export class ObjectDescriptionPanel {
  private panel: vscode.WebviewPanel | undefined;

  show(description: ObjectDescriptionPayload): void {
    const title = `${description.object_type}: ${description.qualified_name}`;
    if (this.panel) {
      this.panel.title = title;
      this.panel.webview.html = buildHtml(description);
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "sqlStudioObjectDescription",
      title,
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    this.panel.webview.html = buildHtml(description);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }
}
