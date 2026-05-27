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

/** Trim whitespace padding between semicolon-delimited chunks. */
function trimStatementRange(sql: string, range: StatementRange): StatementRange {
  let start = range.start;
  let end = range.end;
  while (start < end && /\s/.test(sql[start] ?? "")) {
    start++;
  }
  while (end > start && /\s/.test(sql[end - 1] ?? "")) {
    end--;
  }
  return { start, end };
}

/** SQL sent to the backend: strip file header comments, keep statement body. */
export function normalizeStatementSql(sql: string): string {
  const stripped = stripLeadingLineComments(sql.replace(/;\s*$/, "").trim());
  return stripped;
}

function distanceToRange(offset: number, range: StatementRange): number {
  if (offset >= range.start && offset <= range.end) {
    return 0;
  }
  if (offset < range.start) {
    return range.start - offset;
  }
  return offset - range.end;
}

function isExecutableStatement(sql: string, range: StatementRange): boolean {
  const text = statementText(sql, range);
  return Boolean(text) && !isCommentOnlySql(text);
}

const SESSION_STATEMENT_RE = /^(USE|SET)\b/is;

function stripLeadingLineComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("--"))
    .join("\n")
    .trim();
}

export function isSessionStatement(sql: string): boolean {
  const stripped = stripLeadingLineComments(sql.replace(/;\s*$/, "").trim());
  return Boolean(stripped) && SESSION_STATEMENT_RE.test(stripped);
}

function sessionStatementsBefore(
  sql: string,
  beforeOffset: number,
  ranges: StatementRange[]
): string[] {
  const out: string[] = [];
  for (const range of ranges) {
    const trimmed = trimStatementRange(sql, range);
    if (trimmed.start >= beforeOffset) {
      break;
    }
    if (!isExecutableStatement(sql, range)) {
      continue;
    }
    const text = normalizeStatementSql(statementText(sql, range));
    if (text && isSessionStatement(text)) {
      out.push(text);
    }
  }
  return out;
}

/** USE/SET statements before a document offset (for selections and explicit anchors). */
export function getSessionStatementsBeforeOffset(
  document: vscode.TextDocument,
  position: vscode.Position | number
): string[] {
  const sql = document.getText();
  const offset =
    typeof position === "number" ? position : document.offsetAt(position);
  const ranges = findStatementRanges(sql);
  return sessionStatementsBefore(sql, offset, ranges);
}

/** Start offset of the executable statement at the cursor. */
export function getStatementStartOffset(
  document: vscode.TextDocument,
  position: vscode.Position
): number | undefined {
  const sql = document.getText();
  const offset = document.offsetAt(position);
  const ranges = findStatementRanges(sql);
  const executable = ranges.filter((range) => isExecutableStatement(sql, range));
  const matched = findStatementRangeAtPosition(
    sql,
    offset,
    document,
    position,
    executable
  );
  if (!matched) {
    return undefined;
  }
  return trimStatementRange(sql, matched).start;
}

function findStatementRangeAtPosition(
  sql: string,
  offset: number,
  document: vscode.TextDocument,
  position: vscode.Position,
  executable: StatementRange[]
): StatementRange | undefined {
  const trimmed = executable.map((range) => trimStatementRange(sql, range));

  for (const range of trimmed) {
    if (offset >= range.start && offset <= range.end) {
      return range;
    }
  }

  const line = document.lineAt(position.line);
  const lineStart = document.offsetAt(line.range.start);
  const lineEnd = document.offsetAt(line.range.end);
  const lineText = line.text.trim();

  if (lineText.length > 0) {
    const onLine = trimmed.filter(
      (range) => range.end >= lineStart && range.start <= lineEnd
    );
    if (onLine.length === 1) {
      return onLine[0];
    }
    if (onLine.length > 1) {
      return onLine.reduce((best, range) =>
        distanceToRange(offset, range) < distanceToRange(offset, best) ? range : best
      );
    }
  }

  const preceding = [...trimmed].reverse().find((range) => range.end < offset);
  if (preceding) {
    return preceding;
  }

  const following = trimmed.find((range) => range.start > offset);
  if (following) {
    return following;
  }

  return trimmed[0];
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
  const matched = findStatementRangeAtPosition(
    sql,
    offset,
    document,
    position,
    executable
  );
  if (!matched) {
    return undefined;
  }

  const statement = statementText(sql, matched);
  return normalizeStatementSql(statement) || undefined;
}
