import { describe, expect, it } from "vitest";
import {
  appendEqualsClause,
  buildEqualsClause,
  distinctValuesForColumn,
  parseColumnFilter,
  rowMatchesFilter,
  type FilterExpr,
} from "./columnFilter";

const COLS = ["ticket_param", "city", "amount", "status"];

function matches(input: string, row: Record<string, unknown>): boolean {
  const expr = parseColumnFilter(input, COLS);
  if (!expr) throw new Error(`expected ${input} to parse`);
  return rowMatchesFilter(row, expr);
}

describe("parseColumnFilter", () => {
  it("returns null for empty input", () => {
    expect(parseColumnFilter("", COLS)).toBeNull();
    expect(parseColumnFilter("   ", COLS)).toBeNull();
  });

  it("falls back (null) for free text", () => {
    expect(parseColumnFilter("hotel reservation", COLS)).toBeNull();
    expect(parseColumnFilter("just some words", COLS)).toBeNull();
  });

  it("falls back when the column is unknown", () => {
    expect(parseColumnFilter("unknown_col=1", COLS)).toBeNull();
  });

  it("falls back on trailing junk", () => {
    expect(parseColumnFilter("city=Almaty garbage", COLS)).toBeNull();
  });

  it("parses a single equality", () => {
    const expr = parseColumnFilter("city=Almaty", COLS);
    expect(expr).toEqual<FilterExpr>([
      [{ column: "city", op: "eq", values: [{ text: "Almaty", isNull: false }] }],
    ]);
  });

  it("resolves column casing", () => {
    const expr = parseColumnFilter("CITY=Almaty", COLS);
    expect(expr?.[0][0].column).toBe("city");
  });
});

describe("operators", () => {
  it("= is exact, case-insensitive, trimmed", () => {
    expect(matches("ticket_param=hotel", { ticket_param: "Hotel" })).toBe(true);
    expect(matches("ticket_param=hotel", { ticket_param: "  hotel  " })).toBe(true);
    expect(matches("ticket_param=hotel", { ticket_param: "hotel2" })).toBe(false);
  });

  it("!= is exact negation (the reported bug)", () => {
    expect(matches("ticket_param!=hotel", { ticket_param: "hotel" })).toBe(false);
    expect(matches("ticket_param!=hotel", { ticket_param: "flight" })).toBe(true);
    expect(matches("ticket_param!=hotel", { ticket_param: "hotel2" })).toBe(true);
  });

  it("~ is substring contains, !~ is not-contains", () => {
    expect(matches("city~alma", { city: "Almaty" })).toBe(true);
    expect(matches("city!~alma", { city: "Almaty" })).toBe(false);
    expect(matches("city!~xyz", { city: "Almaty" })).toBe(true);
  });

  it("in / not in match exactly against a list", () => {
    expect(matches("city in (Almaty, Astana)", { city: "Astana" })).toBe(true);
    expect(matches("city in (Almaty, Astana)", { city: "Shymkent" })).toBe(false);
    expect(matches("city not in (Almaty, Astana)", { city: "Shymkent" })).toBe(true);
    expect(matches("city not in (Almaty, Astana)", { city: "Almaty" })).toBe(false);
  });
});

describe("precedence and logic", () => {
  it("AND binds tighter than OR", () => {
    // city=Almaty OR (status=ok AND amount=10)
    const expr = parseColumnFilter("city=Almaty OR status=ok AND amount=10", COLS)!;
    expect(expr).toHaveLength(2);
    expect(expr[0]).toHaveLength(1);
    expect(expr[1]).toHaveLength(2);
    expect(rowMatchesFilter({ city: "Almaty" }, expr)).toBe(true);
    expect(rowMatchesFilter({ status: "ok", amount: 10 }, expr)).toBe(true);
    expect(rowMatchesFilter({ status: "ok", amount: 99 }, expr)).toBe(false);
    expect(rowMatchesFilter({ city: "Astana", status: "no" }, expr)).toBe(false);
  });

  it("is case-insensitive for AND/OR/IN keywords", () => {
    expect(matches("city=a and status=b", { city: "a", status: "b" })).toBe(true);
    expect(matches("city=a or status=b", { city: "x", status: "b" })).toBe(true);
  });
});

describe("quoting and null handling", () => {
  it("matches quoted values containing spaces and keywords", () => {
    expect(matches('city="New York"', { city: "new york" })).toBe(true);
    expect(matches('city="and or in"', { city: "and or in" })).toBe(true);
  });

  it("=null matches NULL, !=null matches non-null", () => {
    expect(matches("city=null", { city: null })).toBe(true);
    expect(matches("city=null", { city: "Almaty" })).toBe(false);
    expect(matches("city!=null", { city: "Almaty" })).toBe(true);
    expect(matches("city!=null", { city: null })).toBe(false);
  });

  it("treats quoted null as a literal string, not the sentinel", () => {
    expect(matches('city="null"', { city: null })).toBe(false);
    expect(matches('city="null"', { city: "null" })).toBe(true);
  });

  it("is null matches NULL, is not null matches non-null", () => {
    expect(matches("city is null", { city: null })).toBe(true);
    expect(matches("city is null", { city: undefined })).toBe(true);
    expect(matches("city is null", { city: "Almaty" })).toBe(false);
    expect(matches("city is not null", { city: "Almaty" })).toBe(true);
    expect(matches("city is not null", { city: null })).toBe(false);
  });

  it("IS NULL is case-insensitive and combines with AND/OR", () => {
    expect(matches("CITY IS NULL", { city: null })).toBe(true);
    expect(matches("city is null AND status=ok", { city: null, status: "ok" })).toBe(true);
    expect(matches("city is not null OR status=ok", { city: null, status: "ok" })).toBe(true);
  });

  it("falls back when `is` is not followed by null", () => {
    expect(parseColumnFilter("city is Almaty", COLS)).toBeNull();
    expect(parseColumnFilter("city is", COLS)).toBeNull();
    expect(parseColumnFilter("city is not Almaty", COLS)).toBeNull();
  });
});

describe("distinctValuesForColumn", () => {
  const rows = [
    { status: "ok" },
    { status: "fail" },
    { status: "ok" },
    { status: null },
  ];

  it("collects sorted distinct values and flags null", () => {
    const result = distinctValuesForColumn(rows, "status", 50);
    expect(result).toEqual({ values: ["fail", "ok"], hasNull: true, count: 3 });
  });

  it("returns null when cardinality exceeds the limit", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ status: `s${i}` }));
    expect(distinctValuesForColumn(many, "status", 50)).toBeNull();
  });
});

describe("buildEqualsClause / appendEqualsClause", () => {
  it("quotes values that need it", () => {
    expect(buildEqualsClause("city", "Almaty")).toBe("city=Almaty");
    expect(buildEqualsClause("city", "New York")).toBe('city="New York"');
    expect(buildEqualsClause("city", null)).toBe("city=null");
    expect(buildEqualsClause("city", "null")).toBe('city="null"');
    expect(buildEqualsClause("c", 'a"b')).toBe('c="a\\"b"');
  });

  it("appends with AND only when the current filter parses", () => {
    expect(appendEqualsClause("", "city", "Almaty", COLS)).toBe("city=Almaty");
    expect(appendEqualsClause("status=ok", "city", "Almaty", COLS)).toBe(
      "status=ok AND city=Almaty"
    );
    // free text -> replace
    expect(appendEqualsClause("some free text", "city", "Almaty", COLS)).toBe("city=Almaty");
  });
});
