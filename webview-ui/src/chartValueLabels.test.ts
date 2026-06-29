import { beforeAll, describe, expect, it } from "vitest";
import type { EChartsOption } from "echarts";
import {
  buildChartOption,
  defaultChartSettings,
  formatChartValue,
  type ChartSettings,
} from "./chartConfig";
import type { ColumnInfo } from "./resultData";

const COLUMNS: ColumnInfo[] = [
  { name: "category", kind: "category" },
  { name: "amount", kind: "numeric" },
];

const RECORDS = [
  { category: "a", amount: 30 },
  { category: "b", amount: 10 },
];

// readThemeColors() reads CSS variables off the document; stub the minimum it needs.
beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: {} };
  g.getComputedStyle = () => ({ getPropertyValue: () => "" });
});

function settings(overrides: Partial<ChartSettings>): ChartSettings {
  return { ...defaultChartSettings(COLUMNS), xColumn: "category", yColumn: "amount", ...overrides };
}

function firstSeries(option: EChartsOption | null) {
  const series = option?.series;
  return Array.isArray(series) ? series[0] : series;
}

describe("formatChartValue", () => {
  it("formats integers with grouping and rounds floats", () => {
    expect(formatChartValue(1000)).toBe((1000).toLocaleString());
    expect(formatChartValue(3.14159)).toBe((3.14).toLocaleString());
  });
});

describe("bar value labels", () => {
  it("omits the label when mode is off", () => {
    const { option } = buildChartOption(RECORDS, settings({ chartType: "bar", valueLabels: "off" }));
    expect((firstSeries(option) as { label?: unknown }).label).toBeUndefined();
  });

  it("shows the raw value when mode is value", () => {
    const { option } = buildChartOption(RECORDS, settings({ chartType: "bar", valueLabels: "value" }));
    const label = (firstSeries(option) as { label?: { show?: boolean; formatter?: (p: { value: number }) => string } }).label;
    expect(label?.show).toBe(true);
    expect(label?.formatter?.({ value: 30 })).toBe(formatChartValue(30));
  });

  it("shows a share of the series total when mode is percent", () => {
    const { option } = buildChartOption(RECORDS, settings({ chartType: "bar", valueLabels: "percent" }));
    const label = (firstSeries(option) as { label?: { formatter?: (p: { value: number }) => string } }).label;
    // total = 40, so 30 -> 75.0%
    expect(label?.formatter?.({ value: 30 })).toBe("75.0%");
  });
});

describe("pie value labels", () => {
  it("uses ECharts placeholders per mode", () => {
    const base = { chartType: "pie" as const, valueColumn: "amount" };
    const off = firstSeries(buildChartOption(RECORDS, settings({ ...base, valueLabels: "off" })).option);
    const value = firstSeries(buildChartOption(RECORDS, settings({ ...base, valueLabels: "value" })).option);
    const percent = firstSeries(buildChartOption(RECORDS, settings({ ...base, valueLabels: "percent" })).option);
    expect((off as { label: { formatter: string } }).label.formatter).toBe("{b}");
    expect((value as { label: { formatter: string } }).label.formatter).toBe("{b}: {c}");
    expect((percent as { label: { formatter: string } }).label.formatter).toBe("{b}: {d}%");
  });
});
