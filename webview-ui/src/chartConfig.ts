import type { EChartsOption } from "echarts";
import { formatAxisLabel, toNumber, type ColumnInfo } from "./resultData";

export type ChartType = "line" | "bar" | "scatter" | "area" | "pie" | "heatmap";
export type Aggregation = "none" | "count" | "sum" | "avg" | "min" | "max";
export type BarLayout = "columns" | "horizontal-scroll";
export type ValueLabelMode = "off" | "value" | "percent";

export interface ChartSettings {
  chartType: ChartType;
  xColumn: string;
  yColumn: string;
  seriesColumn: string;
  heatmapYColumn: string;
  valueColumn: string;
  aggregation: Aggregation;
  barLayout: BarLayout;
  valueLabels: ValueLabelMode;
}

export const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "bar", label: "Bars" },
  { value: "scatter", label: "Scatter" },
  { value: "area", label: "Area" },
  { value: "pie", label: "Pie" },
  { value: "heatmap", label: "Heatmap" },
];

export const BAR_LAYOUT_OPTIONS: { value: BarLayout; label: string }[] = [
  { value: "columns", label: "Columns" },
  { value: "horizontal-scroll", label: "Horizontal (scroll)" },
];

export const VALUE_LABEL_OPTIONS: { value: ValueLabelMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "value", label: "Value" },
  { value: "percent", label: "Percent" },
];

const HORIZONTAL_SCROLL_VISIBLE_CATEGORIES = 30;
const MANY_CATEGORIES_THRESHOLD = 40;
const PIE_SCROLL_LEGEND_THRESHOLD = 12;
const PIE_SLICE_LABEL_THRESHOLD = 20;
export const PIE_LEGEND_WIDTH = 168;
export const PIE_LEGEND_TEXT_WIDTH = 124;

export const AGGREGATION_OPTIONS: { value: Aggregation; label: string }[] = [
  { value: "none", label: "None" },
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

const MAX_CHART_POINTS = 5000;

export interface ChartViewOptions {
  pieScale?: number;
}

export interface ChartBuildResult {
  option: EChartsOption | null;
  warning?: string;
  /** When set, UI can offer a one-click switch (e.g. bar layout for many categories). */
  suggestedBarLayout?: BarLayout;
}

export function defaultChartSettings(columns: ColumnInfo[]): ChartSettings {
  const numeric = columns.filter((col) => col.kind === "numeric");
  const nonNumeric = columns.filter((col) => col.kind !== "numeric");
  const xColumn = nonNumeric[0]?.name ?? columns[0]?.name ?? "";
  const yColumn = numeric[0]?.name ?? columns[1]?.name ?? columns[0]?.name ?? "";
  const heatmapYColumn = columns.find((col) => col.name !== xColumn)?.name ?? yColumn;

  return {
    chartType: "bar",
    xColumn,
    yColumn,
    seriesColumn: "",
    heatmapYColumn,
    valueColumn: yColumn,
    aggregation: "sum",
    barLayout: "columns",
    valueLabels: "value",
  };
}

const PIE_CARDINALITY_SAMPLE = 2000;

/** Distinct-value count for a column, capped — used only to rank columns. */
function distinctCount(records: Record<string, unknown>[], name: string): number {
  const seen = new Set<string>();
  const limit = Math.min(records.length, PIE_CARDINALITY_SAMPLE);
  for (let index = 0; index < limit; index += 1) {
    seen.add(formatAxisLabel(records[index][name]));
  }
  return seen.size;
}

/**
 * Smart defaults for a freshly-opened pie chart: a low-cardinality column makes
 * the most readable label (few slices), and a high-cardinality column — preferring
 * numeric — is the natural measure to aggregate. Aggregation defaults to `count`
 * and labels to `percent` (see {@link defaultPieAggregation} / {@link defaultPieValueLabels}),
 * which renders something meaningful regardless of the chosen value column.
 */
export function pieChartDefaults(
  records: Record<string, unknown>[],
  columns: ColumnInfo[]
): { xColumn: string; valueColumn: string } {
  if (columns.length === 0) {
    return { xColumn: "", valueColumn: "" };
  }

  const ranked = columns.map((col) => ({ col, distinct: distinctCount(records, col.name) }));

  // Label: lowest cardinality with at least two slices; prefer non-numeric on ties.
  const labelRanked = [...ranked].sort((a, b) => {
    const aUseless = a.distinct < 2 ? 1 : 0;
    const bUseless = b.distinct < 2 ? 1 : 0;
    if (aUseless !== bUseless) return aUseless - bUseless;
    if (a.distinct !== b.distinct) return a.distinct - b.distinct;
    const aNumeric = a.col.kind === "numeric" ? 1 : 0;
    const bNumeric = b.col.kind === "numeric" ? 1 : 0;
    return aNumeric - bNumeric;
  });
  const labelColumn = labelRanked[0].col;

  // Value: highest cardinality; prefer numeric, and differ from the label column.
  const valueRanked = [...ranked]
    .filter((entry) => entry.col.name !== labelColumn.name)
    .sort((a, b) => {
      const aNumeric = a.col.kind === "numeric" ? 1 : 0;
      const bNumeric = b.col.kind === "numeric" ? 1 : 0;
      if (aNumeric !== bNumeric) return bNumeric - aNumeric;
      return b.distinct - a.distinct;
    });
  const valueColumn = valueRanked[0]?.col ?? labelColumn;

  return { xColumn: labelColumn.name, valueColumn: valueColumn.name };
}

export const defaultPieAggregation: Aggregation = "count";
export const defaultPieValueLabels: ValueLabelMode = "percent";

/** Compact numeric formatting for on-chart value labels. */
export function formatChartValue(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Cartesian-series (bar/line/area) label config for the chosen value-label mode. */
function cartesianValueLabel(
  mode: ValueLabelMode,
  theme: ThemeColors,
  position: "top" | "right",
  total: number
): Record<string, unknown> | undefined {
  if (mode === "off") {
    return undefined;
  }
  return {
    show: true,
    position,
    color: theme.text,
    formatter: (params: { value: number | string }) => {
      const value = typeof params.value === "number" ? params.value : Number(params.value);
      if (!Number.isFinite(value)) {
        return "";
      }
      if (mode === "percent") {
        return total ? `${((value / total) * 100).toFixed(1)}%` : "0%";
      }
      return formatChartValue(value);
    },
  };
}

function sumValues(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function aggregateValues(values: unknown[], aggregation: Aggregation): number {
  if (aggregation === "count") {
    return values.length;
  }
  const numbers = values.map(toNumber).filter((value): value is number => value !== null);
  if (numbers.length === 0) {
    return 0;
  }
  switch (aggregation) {
    case "sum":
      return numbers.reduce((sum, value) => sum + value, 0);
    case "avg":
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    case "min":
      return Math.min(...numbers);
    case "max":
      return Math.max(...numbers);
    case "none":
      return numbers[0] ?? 0;
    default:
      return numbers.reduce((sum, value) => sum + value, 0);
  }
}

function groupKey(value: unknown): string {
  return formatAxisLabel(value);
}

interface ThemeColors {
  text: string;
  background: string;
  border: string;
  palette: string[];
}

function readCustomChartPalette(style: CSSStyleDeclaration): string[] {
  const palette: string[] = [];
  for (let index = 1; index <= 12; index += 1) {
    const color = style.getPropertyValue(`--sql-studio-chart-${index}`).trim();
    if (color) {
      palette.push(color);
    }
  }
  return palette;
}

function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  const customPalette = readCustomChartPalette(style);
  const defaultPalette = [
    read("--vscode-charts-blue", "#3794ff"),
    read("--vscode-charts-green", "#89d185"),
    read("--vscode-charts-orange", "#d18616"),
    read("--vscode-charts-red", "#f48771"),
    read("--vscode-charts-purple", "#b180d7"),
    read("--vscode-charts-yellow", "#cca700"),
    read("--vscode-charts-foreground", "#cccccc"),
  ];

  return {
    text: read("--vscode-foreground", "#cccccc"),
    background: read("--vscode-editor-background", "#1e1e1e"),
    border: read("--vscode-panel-border", "#444444"),
    palette: customPalette.length > 0 ? customPalette : defaultPalette,
  };
}

function baseOption(theme: ThemeColors): EChartsOption {
  return {
    backgroundColor: "transparent",
    textStyle: { color: theme.text },
    legend: { textStyle: { color: theme.text }, top: 0 },
    grid: { left: 48, right: 24, top: 40, bottom: 48, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.background,
      borderColor: theme.border,
      textStyle: { color: theme.text },
    },
  };
}

function horizontalBarDataZoom(categoryCount: number): NonNullable<EChartsOption["dataZoom"]> {
  const endPercent =
    categoryCount <= HORIZONTAL_SCROLL_VISIBLE_CATEGORIES
      ? 100
      : (HORIZONTAL_SCROLL_VISIBLE_CATEGORIES / categoryCount) * 100;

  return [
    {
      type: "slider",
      yAxisIndex: 0,
      filterMode: "none",
      start: 0,
      end: endPercent,
      width: 16,
      right: 8,
    },
    {
      type: "inside",
      yAxisIndex: 0,
      filterMode: "none",
      zoomOnMouseWheel: "ctrl",
      moveOnMouseWheel: true,
      moveOnMouseMove: true,
      preventDefaultMouseMove: true,
    },
  ];
}

function sortCategoryLabels(
  labels: string[],
  valueForLabel: (label: string) => number
): string[] {
  return [...labels].sort((left, right) => valueForLabel(right) - valueForLabel(left));
}

function buildHorizontalBarOption(
  theme: ThemeColors,
  categoryLabels: string[],
  series: NonNullable<EChartsOption["series"]>
): EChartsOption {
  return {
    ...baseOption(theme),
    color: theme.palette,
    grid: { left: 48, right: 40, top: 40, bottom: 24, containLabel: true },
    dataZoom: horizontalBarDataZoom(categoryLabels.length),
    xAxis: { type: "value", axisLabel: { color: theme.text } },
    yAxis: {
      type: "category",
      data: categoryLabels,
      inverse: true,
      axisLabel: { color: theme.text },
    },
    series,
  };
}

function buildGroupedSeries(
  records: Record<string, unknown>[],
  settings: ChartSettings,
  theme: ThemeColors
): ChartBuildResult {
  const { xColumn, yColumn, seriesColumn, aggregation } = settings;
  if (!xColumn || !yColumn) {
    return { option: null, warning: "Select X and Y columns." };
  }

  const grouped = new Map<string, Map<string, unknown[]>>();
  for (const row of records) {
    const x = groupKey(row[xColumn]);
    const series = seriesColumn ? groupKey(row[seriesColumn]) : "__default__";
    if (!grouped.has(x)) {
      grouped.set(x, new Map());
    }
    const bucket = grouped.get(x)!;
    if (!bucket.has(series)) {
      bucket.set(series, []);
    }
    bucket.get(series)!.push(row[yColumn]);
  }

  const xLabels = [...grouped.keys()];
  const seriesNames = [
    ...new Set(
      [...grouped.values()].flatMap((seriesMap) => [...seriesMap.keys()])
    ),
  ].filter((name) => name !== "__default__");

  const useAggregation = aggregation !== "none" || seriesColumn !== "";
  const seriesType: "line" | "bar" =
    settings.chartType === "bar" ? "bar" : "line";
  const smooth = settings.chartType === "line" || settings.chartType === "area";
  const areaStyle = settings.chartType === "area" ? {} : undefined;
  const useHorizontalScroll =
    settings.chartType === "bar" && settings.barLayout === "horizontal-scroll";

  const valueForLabel = (label: string, seriesName = "__default__") => {
    const values = grouped.get(label)?.get(seriesName) ?? [];
    return useAggregation
      ? aggregateValues(values, aggregation === "none" ? "sum" : aggregation)
      : toNumber(values[0]) ?? 0;
  };

  const orderedLabels = useHorizontalScroll
    ? sortCategoryLabels(xLabels, (label) => {
        if (seriesNames.length === 0) {
          return valueForLabel(label);
        }
        return seriesNames.reduce((sum, name) => sum + valueForLabel(label, name), 0);
      })
    : xLabels;

  const manyCategoriesNotice = barManyCategoriesNotice(settings, orderedLabels.length);

  const labelMode = settings.valueLabels;

  if (seriesNames.length === 0) {
    const data = orderedLabels.map((label) => valueForLabel(label));
    const total = sumValues(data);

    if (useHorizontalScroll) {
      return {
        option: buildHorizontalBarOption(theme, orderedLabels, [
          {
            type: "bar",
            data,
            label: cartesianValueLabel(labelMode, theme, "right", total),
          },
        ]),
        ...manyCategoriesNotice,
      };
    }

    const option: EChartsOption = {
      ...baseOption(theme),
      color: theme.palette,
      xAxis: {
        type: "category",
        data: orderedLabels,
        axisLabel: { color: theme.text, rotate: orderedLabels.length > 12 ? 35 : 0 },
      },
      yAxis: { type: "value", axisLabel: { color: theme.text } },
      series: [
        {
          type: seriesType,
          data,
          areaStyle,
          smooth,
          label: cartesianValueLabel(labelMode, theme, "top", total),
        },
      ] as EChartsOption["series"],
    };
    return { option, ...manyCategoriesNotice };
  }

  const series = seriesNames.map((name) => {
    const data = orderedLabels.map((label) => valueForLabel(label, name));
    return {
      name,
      type: seriesType,
      data,
      areaStyle,
      smooth,
      label: cartesianValueLabel(labelMode, theme, useHorizontalScroll ? "right" : "top", sumValues(data)),
    };
  });

  if (useHorizontalScroll) {
    return {
      option: buildHorizontalBarOption(theme, orderedLabels, series),
      ...manyCategoriesNotice,
    };
  }

  return {
    option: {
      ...baseOption(theme),
      color: theme.palette,
      xAxis: {
        type: "category",
        data: orderedLabels,
        axisLabel: { color: theme.text, rotate: orderedLabels.length > 12 ? 35 : 0 },
      },
      yAxis: { type: "value", axisLabel: { color: theme.text } },
      series,
    },
    ...manyCategoriesNotice,
  };
}

function barManyCategoriesNotice(
  settings: ChartSettings,
  categoryCount: number
): Pick<ChartBuildResult, "warning" | "suggestedBarLayout"> {
  if (
    settings.chartType === "bar" &&
    settings.barLayout === "columns" &&
    categoryCount > MANY_CATEGORIES_THRESHOLD
  ) {
    return {
      warning: `${categoryCount} categories — switch to Horizontal (scroll) for readable bars.`,
      suggestedBarLayout: "horizontal-scroll",
    };
  }
  return {};
}

function buildScatter(
  records: Record<string, unknown>[],
  settings: ChartSettings,
  theme: ThemeColors
): ChartBuildResult {
  const { xColumn, yColumn, seriesColumn } = settings;
  if (!xColumn || !yColumn) {
    return { option: null, warning: "Select X and Y columns (numeric)." };
  }

  const pointsBySeries = new Map<string, [number, number][]>();
  for (const row of records) {
    const x = toNumber(row[xColumn]);
    const y = toNumber(row[yColumn]);
    if (x === null || y === null) {
      continue;
    }
    const series = seriesColumn ? groupKey(row[seriesColumn]) : "__default__";
    if (!pointsBySeries.has(series)) {
      pointsBySeries.set(series, []);
    }
    pointsBySeries.get(series)!.push([x, y]);
  }

  const seriesEntries = [...pointsBySeries.entries()];
  if (seriesEntries.length === 0) {
    return { option: null, warning: "Scatter requires numeric X and Y values." };
  }

  const series = seriesEntries.map(([name, data]) => ({
    name: name === "__default__" ? yColumn : name,
    type: "scatter" as const,
    data,
  }));

  return {
    option: {
      ...baseOption(theme),
      color: theme.palette,
      tooltip: { trigger: "item", backgroundColor: theme.background, borderColor: theme.border, textStyle: { color: theme.text } },
      xAxis: { type: "value", name: xColumn, axisLabel: { color: theme.text } },
      yAxis: { type: "value", name: yColumn, axisLabel: { color: theme.text } },
      series,
    },
  };
}

const PIE_OUTER_RADIUS_MAX = 88;
const PIE_MIN_RING_GAP_PERCENT = 8;

function parsePercentRadius(value: string): number {
  const match = /^([\d.]+)%$/.exec(value.trim());
  return match ? parseFloat(match[1]) : 0;
}

/** Scale pie zoom while preserving donut ring thickness (inner hole does not swallow the chart). */
export function scalePieRadius(
  inner: string,
  outer: string,
  scale: number
): [string, string] {
  const innerPct = parsePercentRadius(inner);
  const outerPct = parsePercentRadius(outer);
  const ringWidth = Math.max(0, outerPct - innerPct);
  const scaledOuter = Math.min(PIE_OUTER_RADIUS_MAX, outerPct * scale);
  const scaledInner = Math.max(0, scaledOuter - ringWidth);
  const maxInner = scaledOuter - PIE_MIN_RING_GAP_PERCENT;
  const finalInner = Math.min(scaledInner, maxInner);
  return [`${finalInner.toFixed(1)}%`, `${scaledOuter.toFixed(1)}%`];
}

export function pieUsesScrollLegend(categoryCount: number): boolean {
  return categoryCount > PIE_SCROLL_LEGEND_THRESHOLD;
}

export function pieBaseRadius(manyCategories: boolean): [string, string] {
  return manyCategories ? ["46%", "84%"] : ["42%", "76%"];
}

export function pieCenter(manyCategories: boolean): [string, string] {
  return manyCategories ? ["38%", "50%"] : ["50%", "52%"];
}

function buildPie(
  records: Record<string, unknown>[],
  settings: ChartSettings,
  theme: ThemeColors,
  pieScale = 1
): ChartBuildResult {
  const nameColumn = settings.xColumn;
  const valueColumn = settings.valueColumn || settings.yColumn;
  const aggregation = settings.aggregation === "none" ? "sum" : settings.aggregation;

  if (!nameColumn || !valueColumn) {
    return { option: null, warning: "Select label and value columns." };
  }

  const grouped = new Map<string, unknown[]>();
  for (const row of records) {
    const name = groupKey(row[nameColumn]);
    if (!grouped.has(name)) {
      grouped.set(name, []);
    }
    grouped.get(name)!.push(row[valueColumn]);
  }

  const data = [...grouped.entries()]
    .map(([name, values]) => ({
      name,
      value: aggregateValues(values, aggregation),
    }))
    .sort((left, right) => right.value - left.value);

  const manyCategories = pieUsesScrollLegend(data.length);
  const showSliceLabels = data.length <= PIE_SLICE_LABEL_THRESHOLD;
  const baseRadius = pieBaseRadius(manyCategories);
  const scaledRadius = scalePieRadius(baseRadius[0], baseRadius[1], pieScale);

  const legend: EChartsOption["legend"] = manyCategories
    ? {
        type: "scroll",
        orient: "vertical",
        right: 8,
        top: 8,
        bottom: 8,
        width: PIE_LEGEND_WIDTH,
        textStyle: {
          color: theme.text,
          overflow: "truncate",
          width: PIE_LEGEND_TEXT_WIDTH,
        },
        pageTextStyle: { color: theme.text },
        pageIconColor: theme.text,
        pageIconInactiveColor: theme.border,
        pageIconSize: 12,
        pageButtonGap: 8,
      }
    : {
        type: "plain",
        textStyle: { color: theme.text },
        top: 0,
      };

  return {
    option: {
      ...baseOption(theme),
      animation: false,
      animationDurationUpdate: 0,
      legend,
      color: theme.palette,
      tooltip: { trigger: "item", backgroundColor: theme.background, borderColor: theme.border, textStyle: { color: theme.text } },
      series: [
        {
          type: "pie",
          radius: scaledRadius,
          center: pieCenter(manyCategories),
          data,
          animation: false,
          animationDurationUpdate: 0,
          label: {
            show: showSliceLabels,
            color: theme.text,
            formatter:
              settings.valueLabels === "percent"
                ? "{b}: {d}%"
                : settings.valueLabels === "value"
                  ? "{b}: {c}"
                  : "{b}",
          },
          labelLine: { show: showSliceLabels },
        },
      ],
    },
  };
}

function buildHeatmap(
  records: Record<string, unknown>[],
  settings: ChartSettings,
  theme: ThemeColors
): ChartBuildResult {
  const { xColumn, heatmapYColumn, valueColumn, aggregation } = settings;
  const agg = aggregation === "none" ? "sum" : aggregation;

  if (!xColumn || !heatmapYColumn || !valueColumn) {
    return { option: null, warning: "Select X, Y, and value columns for heatmap." };
  }

  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xIndex = new Map<string, number>();
  const yIndex = new Map<string, number>();
  const cells = new Map<string, unknown[]>();

  for (const row of records) {
    const x = groupKey(row[xColumn]);
    const y = groupKey(row[heatmapYColumn]);
    if (!xIndex.has(x)) {
      xIndex.set(x, xLabels.length);
      xLabels.push(x);
    }
    if (!yIndex.has(y)) {
      yIndex.set(y, yLabels.length);
      yLabels.push(y);
    }
    const key = `${x}|||${y}`;
    if (!cells.has(key)) {
      cells.set(key, []);
    }
    cells.get(key)!.push(row[valueColumn]);
  }

  const data: [number, number, number][] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const [key, values] of cells) {
    const [xLabel, yLabel] = key.split("|||");
    const value = aggregateValues(values, agg);
    min = Math.min(min, value);
    max = Math.max(max, value);
    data.push([xIndex.get(xLabel)!, yIndex.get(yLabel)!, value]);
  }

  if (data.length === 0) {
    return { option: null, warning: "No data for heatmap." };
  }

  return {
    option: {
      ...baseOption(theme),
      tooltip: {
        position: "top",
        backgroundColor: theme.background,
        borderColor: theme.border,
        textStyle: { color: theme.text },
      },
      grid: { left: 80, right: 24, top: 24, bottom: 80, containLabel: true },
      xAxis: {
        type: "category",
        data: xLabels,
        splitArea: { show: true },
        axisLabel: { color: theme.text, rotate: xLabels.length > 10 ? 35 : 0 },
      },
      yAxis: {
        type: "category",
        data: yLabels,
        splitArea: { show: true },
        axisLabel: { color: theme.text },
      },
      visualMap: {
        min,
        max,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        textStyle: { color: theme.text },
        inRange: { color: ["#313695", "#4575b4", "#74add1", "#abd9e9", "#fee090", "#fdae61", "#f46d43", "#d73027"] },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: data.length <= 100, color: theme.text },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.4)" } },
        },
      ],
    },
  };
}

export function buildChartOption(
  records: Record<string, unknown>[],
  settings: ChartSettings,
  viewOptions: ChartViewOptions = {}
): ChartBuildResult {
  if (records.length === 0) {
    return { option: null, warning: "No rows to chart." };
  }

  let data = records;
  let warning: string | undefined;
  if (records.length > MAX_CHART_POINTS && settings.aggregation === "none") {
    data = records.slice(0, MAX_CHART_POINTS);
    warning = `Showing first ${MAX_CHART_POINTS} rows. Use aggregation to summarize larger sets.`;
  }

  const theme = readThemeColors();

  switch (settings.chartType) {
    case "scatter":
      return { ...buildScatter(data, settings, theme), warning };
    case "pie":
      return {
        ...buildPie(data, settings, theme, viewOptions.pieScale ?? 1),
        warning,
      };
    case "heatmap":
      return { ...buildHeatmap(data, settings, theme), warning };
    case "line":
    case "bar":
    case "area": {
      const result = buildGroupedSeries(data, settings, theme);
      const mergedWarning = [warning, result.warning].filter(Boolean).join(" ");
      return { ...result, warning: mergedWarning || undefined };
    }
    default:
      return { option: null, warning: "Unsupported chart type." };
  }
}

export function aggregationOptionsForChart(chartType: ChartType): Aggregation[] {
  if (chartType === "scatter") {
    return ["none"];
  }
  if (chartType === "pie" || chartType === "heatmap") {
    return ["count", "sum", "avg", "min", "max"];
  }
  return ["none", "count", "sum", "avg", "min", "max"];
}
