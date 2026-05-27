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
