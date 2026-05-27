import * as vscode from "vscode";
import type { Dialect } from "./types";

/** Build SELECT for table preview with dialect-safe quoting. */
export function buildPreviewSql(
  dialect: Dialect,
  qualifiedName: string,
  limit: number
): string {
  const parts = qualifiedName.split(".");
  if (parts.length !== 2) {
    return `SELECT * FROM ${qualifiedName} LIMIT ${limit}`;
  }
  const [schema, table] = parts;
  if (dialect === "postgres") {
    return `SELECT * FROM "${schema}"."${table}" LIMIT ${limit}`;
  }
  return `SELECT * FROM \`${schema}\`.\`${table}\` LIMIT ${limit}`;
}

export function getPreviewRowLimit(): number {
  return vscode.workspace
    .getConfiguration("sqlStudio")
    .get<number>("previewRowLimit", 1000);
}

export function getQueryRowLimit(): number {
  return vscode.workspace
    .getConfiguration("sqlStudio")
    .get<number>("defaultRowLimit", 10000);
}

export interface StatementRange {
  start: number;
  end: number;
}

/** Split SQL text into statement ranges by semicolons outside of quotes/comments. */
export function findStatementRanges(sql: string): StatementRange[] {
  const ranges: StatementRange[] = [];
  let start = 0;
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i++;
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      }
      i++;
      continue;
    }

    if (inBacktick) {
      if (ch === "`") {
        inBacktick = false;
      }
      i++;
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      i++;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      i++;
      continue;
    }

    if (ch === "`") {
      inBacktick = true;
      i++;
      continue;
    }

    if (ch === ";") {
      ranges.push({ start, end: i });
      start = i + 1;
      i++;
      continue;
    }

    i++;
  }

  if (start < sql.length) {
    ranges.push({ start, end: sql.length });
  }

  return ranges;
}

export function isCommentOnlySql(sql: string): boolean {
  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--")) {
      continue;
    }
    return false;
  }
  return true;
}

function statementText(sql: string, range: StatementRange): string {
  return sql.slice(range.start, range.end).trim();
}

function isExecutableStatement(sql: string, range: StatementRange): boolean {
  const text = statementText(sql, range);
  return Boolean(text) && !isCommentOnlySql(text);
}

/** Return the SQL statement at the editor cursor (not the whole document). */
export function getStatementAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): string | undefined {
  const sql = document.getText();
  const offset = document.offsetAt(position);
  const ranges = findStatementRanges(sql);
  const executable = ranges.filter((range) => isExecutableStatement(sql, range));

  for (const range of executable) {
    if (offset >= range.start && offset <= range.end) {
      return statementText(sql, range);
    }
  }

  const line = document.lineAt(position.line);
  const lineStart = document.offsetAt(line.range.start);
  const lineEnd = document.offsetAt(line.range.end);

  for (const range of executable) {
    if (range.end >= lineStart && range.start <= lineEnd) {
      return statementText(sql, range);
    }
  }

  const next = executable.find((range) => range.start >= offset);
  if (next) {
    return statementText(sql, next);
  }

  const prev = [...executable].reverse().find((range) => range.end <= offset);
  if (prev) {
    return statementText(sql, prev);
  }

  return undefined;
}
