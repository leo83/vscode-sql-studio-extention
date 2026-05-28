import type { EChartsOption } from "echarts";
import { formatAxisLabel, toNumber, type ColumnInfo } from "./resultData";

export type ChartType = "line" | "bar" | "scatter" | "area" | "pie" | "heatmap";
export type Aggregation = "none" | "count" | "sum" | "avg" | "min" | "max";
export type BarLayout = "columns" | "horizontal-scroll";

export interface ChartSettings {
  chartType: ChartType;
  xColumn: string;
  yColumn: string;
  seriesColumn: string;
  heatmapYColumn: string;
  valueColumn: string;
  aggregation: Aggregation;
  barLayout: BarLayout;
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

const HORIZONTAL_SCROLL_VISIBLE_CATEGORIES = 30;
const MANY_CATEGORIES_THRESHOLD = 40;

export const AGGREGATION_OPTIONS: { value: Aggregation; label: string }[] = [
  { value: "none", label: "None" },
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

const MAX_CHART_POINTS = 5000;

export interface ChartBuildResult {
  option: EChartsOption | null;
  warning?: string;
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
  };
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

function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    text: read("--vscode-foreground", "#cccccc"),
    background: read("--vscode-editor-background", "#1e1e1e"),
    border: read("--vscode-panel-border", "#444444"),
    palette: [
      read("--vscode-charts-blue", "#3794ff"),
      read("--vscode-charts-green", "#89d185"),
      read("--vscode-charts-orange", "#d18616"),
      read("--vscode-charts-red", "#f48771"),
      read("--vscode-charts-purple", "#b180d7"),
      read("--vscode-charts-yellow", "#cca700"),
      read("--vscode-charts-foreground", "#cccccc"),
    ],
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

  const manyCategoriesHint =
    settings.chartType === "bar" &&
    settings.barLayout === "columns" &&
    orderedLabels.length > MANY_CATEGORIES_THRESHOLD
      ? `${orderedLabels.length} categories — switch to Horizontal (scroll) for readable bars.`
      : undefined;

  if (seriesNames.length === 0) {
    const data = orderedLabels.map((label) => valueForLabel(label));

    if (useHorizontalScroll) {
      return {
        option: buildHorizontalBarOption(theme, orderedLabels, [
          {
            type: "bar",
            data,
          },
        ]),
        warning: manyCategoriesHint,
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
        },
      ] as EChartsOption["series"],
    };
    return { option, warning: manyCategoriesHint };
  }

  const series = seriesNames.map((name) => ({
    name,
    type: seriesType,
    data: orderedLabels.map((label) => valueForLabel(label, name)),
    areaStyle,
    smooth,
  }));

  if (useHorizontalScroll) {
    return {
      option: buildHorizontalBarOption(theme, orderedLabels, series),
      warning: manyCategoriesHint,
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
    warning: manyCategoriesHint,
  };
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

function buildPie(
  records: Record<string, unknown>[],
  settings: ChartSettings,
  theme: ThemeColors
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

  const data = [...grouped.entries()].map(([name, values]) => ({
    name,
    value: aggregateValues(values, aggregation),
  }));

  return {
    option: {
      ...baseOption(theme),
      color: theme.palette,
      tooltip: { trigger: "item", backgroundColor: theme.background, borderColor: theme.border, textStyle: { color: theme.text } },
      series: [
        {
          type: "pie",
          radius: ["35%", "65%"],
          center: ["50%", "55%"],
          data,
          label: { color: theme.text },
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
  settings: ChartSettings
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
      return { ...buildPie(data, settings, theme), warning };
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
