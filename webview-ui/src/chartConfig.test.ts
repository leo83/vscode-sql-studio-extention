import { describe, expect, it } from "vitest";
import {
  pieBaseRadius,
  pieCenter,
  pieChartDefaults,
  pieUsesScrollLegend,
  scalePieRadius,
} from "./chartConfig";
import type { ColumnInfo } from "./resultData";

describe("pieChartDefaults", () => {
  const columns: ColumnInfo[] = [
    { name: "status", kind: "category" },
    { name: "amount", kind: "numeric" },
    { name: "id", kind: "category" },
  ];
  const records = Array.from({ length: 6 }, (_, i) => ({
    status: i % 2 === 0 ? "open" : "closed",
    amount: i * 10,
    id: `row-${i}`,
  }));

  it("picks the low-cardinality column as label and a high-cardinality numeric as value", () => {
    expect(pieChartDefaults(records, columns)).toEqual({
      xColumn: "status",
      valueColumn: "amount",
    });
  });

  it("avoids single-value columns as the label", () => {
    const cols: ColumnInfo[] = [
      { name: "constant", kind: "category" },
      { name: "label", kind: "category" },
      { name: "value", kind: "numeric" },
    ];
    const rows = [
      { constant: "x", label: "a", value: 1 },
      { constant: "x", label: "b", value: 2 },
      { constant: "x", label: "c", value: 3 },
    ];
    expect(pieChartDefaults(rows, cols).xColumn).toBe("label");
  });

  it("returns empty columns when there are none", () => {
    expect(pieChartDefaults([], [])).toEqual({ xColumn: "", valueColumn: "" });
  });
});

describe("pieUsesScrollLegend", () => {
  it("enables scroll legend for large category sets", () => {
    expect(pieUsesScrollLegend(13)).toBe(true);
    expect(pieUsesScrollLegend(12)).toBe(false);
  });
});

describe("pieBaseRadius", () => {
  it("uses a larger radius when the scroll legend is shown", () => {
    expect(pieBaseRadius(true)).toEqual(["46%", "84%"]);
    expect(pieBaseRadius(false)).toEqual(["42%", "76%"]);
  });
});

describe("pieCenter", () => {
  it("shifts the pie left to leave room for the legend", () => {
    expect(pieCenter(true)).toEqual(["38%", "50%"]);
    expect(pieCenter(false)).toEqual(["50%", "52%"]);
  });
});

describe("scalePieRadius", () => {
  it("scales outer radius and preserves donut ring thickness", () => {
    expect(scalePieRadius("46%", "84%", 1)).toEqual(["46.0%", "84.0%"]);
    expect(scalePieRadius("46%", "84%", 2)).toEqual(["50.0%", "88.0%"]);
  });
});
