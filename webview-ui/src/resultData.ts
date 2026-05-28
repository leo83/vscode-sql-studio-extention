import type { QueryColumn, QueryResult } from "./types";

export type ColumnKind = "numeric" | "datetime" | "category";

export interface ColumnInfo {
  name: string;
  kind: ColumnKind;
  dataType?: string | null;
}

const NUMERIC_TYPE_RE =
  /^(?:smallint|integer|int|bigint|decimal|numeric|real|double|float|money|number|uint|int\d+|float\d+|double precision)/i;
const DATETIME_TYPE_RE =
  /^(?:date|time|timestamp|datetime|timestamptz|datetime2|smalldatetime)/i;

export function queryResultToRecords(result: QueryResult): Record<string, unknown>[] {
  const columnNames =
    result.columns.length > 0
      ? result.columns.map((col) => col.name)
      : Array.from({ length: result.rows[0]?.length ?? 0 }, (_, index) => `column_${index + 1}`);

  return result.rows.map((row) => {
    const record: Record<string, unknown> = {};
    columnNames.forEach((name, index) => {
      record[name] = row[index];
    });
    return record;
  });
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function looksLikeDate(value: unknown): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed) && !/^\d{2}[./-]\d{2}[./-]\d{4}/.test(trimmed)) {
    return false;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed);
}

function inferKind(name: string, values: unknown[], dataType?: string | null): ColumnKind {
  if (dataType) {
    if (NUMERIC_TYPE_RE.test(dataType)) {
      return "numeric";
    }
    if (DATETIME_TYPE_RE.test(dataType)) {
      return "datetime";
    }
  }

  const sample = values.filter((value) => value !== null && value !== undefined).slice(0, 200);
  if (sample.length === 0) {
    return "category";
  }

  const numericCount = sample.filter((value) => toNumber(value) !== null).length;
  if (numericCount / sample.length >= 0.8) {
    return "numeric";
  }

  const dateCount = sample.filter((value) => looksLikeDate(value)).length;
  if (dateCount / sample.length >= 0.8) {
    return "datetime";
  }

  if (/^(?:id|_?id)$/i.test(name)) {
    return "category";
  }

  return "category";
}

export function analyzeColumns(
  records: Record<string, unknown>[],
  columns: QueryColumn[]
): ColumnInfo[] {
  const names =
    columns.length > 0
      ? columns.map((col) => col.name)
      : Object.keys(records[0] ?? {});

  return names.map((name) => {
    const meta = columns.find((col) => col.name === name);
    const values = records.map((row) => row[name]);
    return {
      name,
      kind: inferKind(name, values, meta?.data_type),
      dataType: meta?.data_type,
    };
  });
}

export function formatAxisLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export const ROW_NUM_COLUMN_WIDTH = 40;
const MIN_COLUMN_WIDTH = 48;
const MAX_COLUMN_WIDTH = 280;
const COLUMN_PADDING = 24;
const CHAR_WIDTH = 8;
const SIZE_SAMPLE_ROWS = 100;

function cellDisplayLength(value: unknown): number {
  if (value === null || value === undefined) {
    return 4;
  }
  return String(value).length;
}

/** Estimate column widths from header + cell text, capped at MAX_COLUMN_WIDTH. */
export function computeColumnSizes(
  columnNames: string[],
  data: Record<string, unknown>[]
): Record<string, number> {
  const sample = data.slice(0, SIZE_SAMPLE_ROWS);
  const sizes: Record<string, number> = {};

  for (const name of columnNames) {
    let maxChars = name.length;
    for (const row of sample) {
      maxChars = Math.max(maxChars, cellDisplayLength(row[name]));
    }
    const estimated = maxChars * CHAR_WIDTH + COLUMN_PADDING;
    sizes[name] = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, estimated));
  }

  return sizes;
}

export { toNumber };
