// Client-side column filter for the results table.
//
// Grammar (AND binds tighter than OR):
//   expr      := orGroup ( "OR" orGroup )*
//   orGroup   := cond ( "AND" cond )*
//   cond      := column op value
//              | column ("in" | "not" "in") "(" value ("," value)* ")"
//              | column "is" "not"? "null"
//   op        := "=" | "!=" | "~" | "!~"
//
// "=" / "!=" are exact (case-insensitive, trimmed); "~" / "!~" are substring
// (contains / not-contains). The bare word `null` (unquoted) is the NULL sentinel:
// `col=null` (or `col is null`) matches NULL cells, `col!=null` (or
// `col is not null`) matches non-NULL cells.
//
// Parsing is all-or-nothing: the whole input must parse into conditions whose
// columns are real, otherwise the caller falls back to free-text search.

export type FilterOp = "eq" | "neq" | "contains" | "ncontains" | "in" | "nin";

export interface ColumnCondition {
  column: string;
  op: FilterOp;
  // eq/neq/contains/ncontains carry one value; in/nin carry the list.
  values: FilterValue[];
}

export interface FilterValue {
  text: string;
  // true when the token was the unquoted bare word `null`.
  isNull: boolean;
}

// Outer OR of inner AND-groups.
export type FilterExpr = ColumnCondition[][];

type Tok =
  | { t: "word"; v: string }
  | { t: "str"; v: string }
  | { t: "and" }
  | { t: "or" }
  | { t: "in" }
  | { t: "is" }
  | { t: "not" }
  | { t: "op"; v: "=" | "!=" | "~" | "!~" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" };

const WORD_STOP = new Set([" ", "\t", "\n", "\r", "(", ")", ",", "=", "!", "~", '"', "'"]);

function tokenize(input: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "(") {
      toks.push({ t: "lp" });
      i++;
      continue;
    }
    if (ch === ")") {
      toks.push({ t: "rp" });
      i++;
      continue;
    }
    if (ch === ",") {
      toks.push({ t: "comma" });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let s = "";
      let closed = false;
      while (i < n) {
        const c = input[i];
        if (c === "\\" && i + 1 < n) {
          s += input[i + 1];
          i += 2;
          continue;
        }
        if (c === quote) {
          closed = true;
          i++;
          break;
        }
        s += c;
        i++;
      }
      if (!closed) return null;
      toks.push({ t: "str", v: s });
      continue;
    }
    // Multi-char operators before single-char.
    if (ch === "!" && input[i + 1] === "=") {
      toks.push({ t: "op", v: "!=" });
      i += 2;
      continue;
    }
    if (ch === "!" && input[i + 1] === "~") {
      toks.push({ t: "op", v: "!~" });
      i += 2;
      continue;
    }
    if (ch === "=") {
      toks.push({ t: "op", v: "=" });
      i++;
      continue;
    }
    if (ch === "~") {
      toks.push({ t: "op", v: "~" });
      i++;
      continue;
    }
    if (ch === "!") {
      // Lone "!" is not a valid token.
      return null;
    }
    // Bare word.
    let w = "";
    while (i < n && !WORD_STOP.has(input[i])) {
      w += input[i];
      i++;
    }
    if (w === "") return null;
    const lower = w.toLowerCase();
    if (lower === "and") toks.push({ t: "and" });
    else if (lower === "or") toks.push({ t: "or" });
    else if (lower === "in") toks.push({ t: "in" });
    else if (lower === "is") toks.push({ t: "is" });
    else if (lower === "not") toks.push({ t: "not" });
    else toks.push({ t: "word", v: w });
  }
  return toks;
}

function toValue(tok: Tok): FilterValue | null {
  if (tok.t === "str") return { text: tok.v, isNull: false };
  if (tok.t === "word") {
    return { text: tok.v, isNull: tok.v.toLowerCase() === "null" };
  }
  return null;
}

/**
 * Parse the filter input. Returns null when the input is empty or does not parse
 * cleanly into conditions over real columns (caller should fall back to free text).
 * Column names are matched case-insensitively and resolved to their real casing.
 */
export function parseColumnFilter(input: string, columnNames: string[]): FilterExpr | null {
  if (!input.trim()) return null;
  const toks = tokenize(input);
  if (!toks || toks.length === 0) return null;

  const colByLower = new Map<string, string>();
  for (const name of columnNames) colByLower.set(name.toLowerCase(), name);

  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];

  const parseValue = (): FilterValue | null => {
    const tok = peek();
    if (!tok) return null;
    const v = toValue(tok);
    if (v) pos++;
    return v;
  };

  const parseCond = (): ColumnCondition | null => {
    const colTok = peek();
    if (!colTok || (colTok.t !== "word" && colTok.t !== "str")) return null;
    const rawCol = colTok.v;
    const resolved = colByLower.get(rawCol.toLowerCase());
    if (!resolved) return null; // unknown column -> bail to free text
    pos++;

    const next = peek();
    if (!next) return null;

    if (next.t === "op") {
      pos++;
      const val = parseValue();
      if (!val) return null;
      const op: FilterOp =
        next.v === "=" ? "eq" : next.v === "!=" ? "neq" : next.v === "~" ? "contains" : "ncontains";
      return { column: resolved, op, values: [val] };
    }

    if (next.t === "is") {
      pos++;
      let negate = false;
      if (peek()?.t === "not") {
        pos++;
        negate = true;
      }
      // `is`/`is not` is only meaningful with `null`.
      const nullTok = peek();
      if (!nullTok || nullTok.t !== "word" || nullTok.v.toLowerCase() !== "null") {
        return null;
      }
      pos++;
      const nullVal: FilterValue = { text: nullTok.v, isNull: true };
      return { column: resolved, op: negate ? "neq" : "eq", values: [nullVal] };
    }

    if (next.t === "in" || next.t === "not") {
      let negate = false;
      if (next.t === "not") {
        pos++;
        if (peek()?.t !== "in") return null;
        negate = true;
      }
      pos++; // consume "in"
      if (peek()?.t !== "lp") return null;
      pos++;
      const values: FilterValue[] = [];
      // require at least one value
      const first = parseValue();
      if (!first) return null;
      values.push(first);
      while (peek()?.t === "comma") {
        pos++;
        const v = parseValue();
        if (!v) return null;
        values.push(v);
      }
      if (peek()?.t !== "rp") return null;
      pos++;
      return { column: resolved, op: negate ? "nin" : "in", values };
    }

    return null;
  };

  const parseAnd = (): ColumnCondition[] | null => {
    const conds: ColumnCondition[] = [];
    const first = parseCond();
    if (!first) return null;
    conds.push(first);
    while (peek()?.t === "and") {
      pos++;
      const c = parseCond();
      if (!c) return null;
      conds.push(c);
    }
    return conds;
  };

  const groups: FilterExpr = [];
  const firstGroup = parseAnd();
  if (!firstGroup) return null;
  groups.push(firstGroup);
  while (peek()?.t === "or") {
    pos++;
    const g = parseAnd();
    if (!g) return null;
    groups.push(g);
  }

  if (pos !== toks.length) return null; // trailing junk -> free text
  return groups;
}

function eqValue(cell: unknown, value: FilterValue): boolean {
  if (value.isNull) return cell === null || cell === undefined;
  if (cell === null || cell === undefined) return false;
  return String(cell).trim().toLowerCase() === value.text.trim().toLowerCase();
}

function containsValue(cell: unknown, value: FilterValue): boolean {
  if (value.isNull) return cell === null || cell === undefined;
  if (cell === null || cell === undefined) return false;
  return String(cell).toLowerCase().includes(value.text.toLowerCase());
}

function condMatches(row: Record<string, unknown>, cond: ColumnCondition): boolean {
  const cell = row[cond.column];
  switch (cond.op) {
    case "eq":
      return eqValue(cell, cond.values[0]);
    case "neq":
      return !eqValue(cell, cond.values[0]);
    case "contains":
      return containsValue(cell, cond.values[0]);
    case "ncontains":
      return !containsValue(cell, cond.values[0]);
    case "in":
      return cond.values.some((v) => eqValue(cell, v));
    case "nin":
      return !cond.values.some((v) => eqValue(cell, v));
    default:
      return true;
  }
}

export function rowMatchesFilter(row: Record<string, unknown>, expr: FilterExpr): boolean {
  // OR of AND-groups.
  return expr.some((group) => group.every((cond) => condMatches(row, cond)));
}

export interface DistinctValues {
  values: string[]; // distinct cell values as display strings (" " sentinel for NULL excluded)
  hasNull: boolean;
  count: number; // total distinct count including NULL
}

/**
 * Collect distinct values of a column from the loaded rows. Returns null when the
 * distinct count exceeds `limit` (column is not low-cardinality / a classifier).
 */
export function distinctValuesForColumn(
  data: Record<string, unknown>[],
  column: string,
  limit: number
): DistinctValues | null {
  const seen = new Set<string>();
  let hasNull = false;
  for (const row of data) {
    const cell = row[column];
    if (cell === null || cell === undefined) {
      hasNull = true;
    } else {
      seen.add(String(cell));
    }
    if (seen.size + (hasNull ? 1 : 0) > limit) return null;
  }
  const values = Array.from(seen).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  return { values, hasNull, count: values.length + (hasNull ? 1 : 0) };
}

const NEEDS_QUOTE_RE = /[\s(),"'=!~]/;

/** Render a `column=value` clause, quoting the value when needed. */
export function buildEqualsClause(column: string, value: string | null): string {
  if (value === null) return `${column}=null`;
  if (value === "" || NEEDS_QUOTE_RE.test(value) || value.toLowerCase() === "null") {
    return `${column}="${value.replace(/(["\\])/g, "\\$1")}"`;
  }
  return `${column}=${value}`;
}

/**
 * Append `column=value` to an existing filter string. Appends with AND when the
 * current filter is already a valid structured filter; otherwise replaces it.
 */
export function appendEqualsClause(
  current: string,
  column: string,
  value: string | null,
  columnNames: string[]
): string {
  const clause = buildEqualsClause(column, value);
  const trimmed = current.trim();
  if (trimmed && parseColumnFilter(trimmed, columnNames)) {
    return `${trimmed} AND ${clause}`;
  }
  return clause;
}
