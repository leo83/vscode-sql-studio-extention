import * as vscode from "vscode";

const SQL_STUDIO_LANGUAGE_RE = /^sql-studio/;

/** File extensions handled by SQL Studio. */
const SQL_FILE_EXTENSIONS = new Set([".sql", ".pgsql", ".psql", ".chsql", ".tsql"]);

export function isSqlStudioLanguage(languageId: string): boolean {
  return SQL_STUDIO_LANGUAGE_RE.test(languageId);
}

export function isSqlFileDocument(document: vscode.TextDocument): boolean {
  if (document.uri.scheme === "untitled") {
    return isSqlStudioLanguage(document.languageId);
  }
  const path = document.uri.fsPath.toLowerCase();
  for (const ext of SQL_FILE_EXTENSIONS) {
    if (path.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

export function shouldAutoAssociateSqlFiles(): boolean {
  return vscode.workspace
    .getConfiguration("sqlStudio")
    .get<boolean>("autoAssociateSqlFiles", true);
}

/** Map generic `sql` (or other) language to SQL Studio for known SQL file paths. */
export async function ensureSqlStudioLanguage(
  document: vscode.TextDocument
): Promise<void> {
  if (!shouldAutoAssociateSqlFiles()) {
    return;
  }
  if (isSqlStudioLanguage(document.languageId)) {
    return;
  }
  if (!isSqlFileDocument(document)) {
    return;
  }
  const path = document.uri.fsPath.toLowerCase();
  let languageId = "sql-studio-sql";
  if (path.endsWith(".chsql")) {
    languageId = "sql-studio-clickhouse";
  } else if (path.endsWith(".tsql")) {
    languageId = "sql-studio-mssql";
  } else if (path.endsWith(".pgsql") || path.endsWith(".psql")) {
    languageId = "sql-studio-postgres";
  }
  await vscode.languages.setTextDocumentLanguage(document, languageId);
}

export function findSqlStudioEditor(): vscode.TextEditor | undefined {
  const active = vscode.window.activeTextEditor;
  if (active && isSqlStudioEditor(active)) {
    return active;
  }
  const sqlEditors = vscode.window.visibleTextEditors.filter((e) =>
    isSqlStudioEditor(e)
  );
  if (sqlEditors.length === 1) {
    return sqlEditors[0];
  }
  return undefined;
}

export function isSqlStudioEditor(editor: vscode.TextEditor): boolean {
  if (isSqlStudioLanguage(editor.document.languageId)) {
    return true;
  }
  return isSqlFileDocument(editor.document);
}

export async function findSqlStudioEditorReady(): Promise<
  vscode.TextEditor | undefined
> {
  const editor = findSqlStudioEditor();
  if (!editor) {
    return undefined;
  }
  await ensureSqlStudioLanguage(editor.document);
  return vscode.window.activeTextEditor ?? editor;
}
