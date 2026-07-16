import { describe, expect, it } from "vitest";
import { hashSql, isLayoutEmpty } from "./tableLayout";

describe("hashSql", () => {
  it("is stable for the same query", () => {
    expect(hashSql("SELECT * FROM t")).toBe(hashSql("SELECT * FROM t"));
  });

  it("ignores whitespace differences", () => {
    expect(hashSql("SELECT  *\n FROM   t")).toBe(hashSql("SELECT * FROM t"));
    expect(hashSql("  SELECT * FROM t  ")).toBe(hashSql("SELECT * FROM t"));
  });

  it("differs for different queries", () => {
    expect(hashSql("SELECT * FROM a")).not.toBe(hashSql("SELECT * FROM b"));
  });

  it("is case-sensitive (distinct identifiers keep distinct layouts)", () => {
    expect(hashSql("select 1")).not.toBe(hashSql("SELECT 1"));
  });

  it("produces a compact non-empty string", () => {
    const h = hashSql("SELECT 1");
    expect(h.length).toBeGreaterThan(0);
    expect(h).toMatch(/^[a-z0-9]+$/);
  });
});

describe("isLayoutEmpty", () => {
  it("is true for a blank layout", () => {
    expect(isLayoutEmpty({})).toBe(true);
    expect(isLayoutEmpty({ sorting: [], columnOrder: [], columnSizing: {}, columnVisibility: {} })).toBe(true);
  });

  it("is false when any facet is customized", () => {
    expect(isLayoutEmpty({ sorting: [{ id: "a", desc: true }] })).toBe(false);
    expect(isLayoutEmpty({ columnOrder: ["a", "b"] })).toBe(false);
    expect(isLayoutEmpty({ columnSizing: { a: 120 } })).toBe(false);
    expect(isLayoutEmpty({ columnVisibility: { a: false } })).toBe(false);
  });
});
