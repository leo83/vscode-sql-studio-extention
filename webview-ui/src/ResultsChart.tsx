import ReactECharts from "echarts-for-react";
import type { EChartsType } from "echarts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { ChartTypePicker } from "./ChartTypePicker";
import {
  AGGREGATION_OPTIONS,
  BAR_LAYOUT_OPTIONS,
  VALUE_LABEL_OPTIONS,
  aggregationOptionsForChart,
  buildChartOption,
  defaultPieAggregation,
  defaultPieValueLabels,
  pieChartDefaults,
  type BarLayout,
  type ChartSettings,
  type ChartType,
} from "./chartConfig";
import { attachPieChartGestures, type PieGestureHandlers } from "./pieChartGestures";
import type { ColumnInfo } from "./resultData";

interface Props {
  records: Record<string, unknown>[];
  columns: ColumnInfo[];
  settings: ChartSettings;
  onSettingsChange: React.Dispatch<React.SetStateAction<ChartSettings>>;
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
  allowEmpty,
  emptyLabel = "—",
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <label className="chart-field">
      <span className="chart-field-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ResultsChart({ records, columns, settings, onSettingsChange: setSettings }: Props) {
  const [pieScale, setPieScale] = useState(1);
  const chartRef = useRef<ReactECharts>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const pieScaleRef = useRef(pieScale);
  const pieGesturesRef = useRef<PieGestureHandlers | null>(null);
  pieScaleRef.current = pieScale;

  const isHeatmap = settings.chartType === "heatmap";
  const isPie = settings.chartType === "pie";
  const isScatter = settings.chartType === "scatter";
  const isBar = settings.chartType === "bar";

  useEffect(() => {
    setPieScale(1);
  }, [settings.chartType, records]);

  // Smart pie defaults are applied once per query (stable column shape), so a
  // column-filter change — which swaps the `records` identity — doesn't clobber
  // the user's tweaks. A new query (new signature) re-arms them.
  const columnsKey = useMemo(
    () => columns.map((col) => `${col.name}:${col.kind}`).join("|"),
    [columns]
  );
  const pieDefaultsKeyRef = useRef<string | null>(null);

  const columnOptions = useMemo(
    () =>
      columns.map((col) => ({
        value: col.name,
        label: `${col.name} (${col.kind})`,
      })),
    [columns]
  );

  const numericOptions = useMemo(
    () => columnOptions.filter((opt) => columns.find((col) => col.name === opt.value)?.kind === "numeric"),
    [columnOptions, columns]
  );

  const allowedAggregations = aggregationOptionsForChart(settings.chartType);
  const aggregationOptions = AGGREGATION_OPTIONS.filter((opt) =>
    allowedAggregations.includes(opt.value)
  );

  useEffect(() => {
    if (!allowedAggregations.includes(settings.aggregation)) {
      setSettings((prev) => ({
        ...prev,
        aggregation: allowedAggregations[0] ?? "sum",
      }));
    }
  }, [allowedAggregations, settings.aggregation]);

  const { option, warning, suggestedBarLayout } = useMemo(
    () =>
      buildChartOption(records, settings, {
        pieScale: isPie ? pieScale : undefined,
      }),
    [records, settings, isPie, pieScale]
  );

  const horizontalScrollBarLabel =
    BAR_LAYOUT_OPTIONS.find((opt) => opt.value === "horizontal-scroll")?.label ??
    "Horizontal (scroll)";

  const detachPieGestures = useCallback(() => {
    pieGesturesRef.current?.dispose();
    pieGesturesRef.current = null;
  }, []);

  const attachPieGestures = useCallback(
    (chart: EChartsType) => {
      detachPieGestures();
      if (!isPie) {
        return;
      }
      pieGesturesRef.current = attachPieChartGestures(
        chart,
        () => pieScaleRef.current,
        setPieScale
      );
    },
    [detachPieGestures, isPie]
  );

  const onChartReady = useCallback(
    (chart: EChartsType) => {
      attachPieGestures(chart);
    },
    [attachPieGestures]
  );

  useEffect(() => {
    if (!isPie) {
      detachPieGestures();
      return;
    }
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      attachPieGestures(chart);
    }
    return detachPieGestures;
  }, [attachPieGestures, detachPieGestures, isPie]);

  useEffect(() => () => detachPieGestures(), [detachPieGestures]);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) {
      return;
    }
    const resizeChart = () => {
      chartRef.current?.getEchartsInstance()?.resize();
    };
    resizeChart();
    const observer = new ResizeObserver(resizeChart);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [option]);

  const update = (patch: Partial<ChartSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const onChartTypeChange = (chartType: ChartType) => {
    setPieScale(1);
    const applyPieDefaults =
      chartType === "pie" && pieDefaultsKeyRef.current !== columnsKey;
    if (applyPieDefaults) {
      pieDefaultsKeyRef.current = columnsKey;
    }
    setSettings((prev) => {
      const next: ChartSettings = { ...prev, chartType };
      const aggs = aggregationOptionsForChart(chartType);
      if (!aggs.includes(next.aggregation)) {
        next.aggregation = aggs[0] ?? "sum";
      }
      if (applyPieDefaults) {
        const { xColumn, valueColumn } = pieChartDefaults(records, columns);
        next.xColumn = xColumn;
        next.valueColumn = valueColumn;
        next.yColumn = valueColumn;
        next.aggregation = defaultPieAggregation;
        next.valueLabels = defaultPieValueLabels;
      } else if (chartType === "pie" && !next.valueColumn) {
        next.valueColumn = next.yColumn;
      }
      return next;
    });
  };

  return (
    <div className="chart-panel">
      <aside className="chart-config">
        <label className="chart-field">
          <span className="chart-field-label">Chart type</span>
          <ChartTypePicker
            value={settings.chartType}
            onChange={onChartTypeChange}
          />
        </label>

        {isBar ? (
          <FieldSelect
            label="Bar layout"
            value={settings.barLayout}
            options={BAR_LAYOUT_OPTIONS}
            onChange={(value) => update({ barLayout: value as BarLayout })}
          />
        ) : null}

        {isPie ? (
          <>
            <FieldSelect
              label="Label column"
              value={settings.xColumn}
              options={columnOptions}
              onChange={(value) => update({ xColumn: value })}
            />
            <FieldSelect
              label="Value column"
              value={settings.valueColumn || settings.yColumn}
              options={numericOptions.length > 0 ? numericOptions : columnOptions}
              onChange={(value) => update({ valueColumn: value, yColumn: value })}
            />
          </>
        ) : isHeatmap ? (
          <>
            <FieldSelect
              label="X column"
              value={settings.xColumn}
              options={columnOptions}
              onChange={(value) => update({ xColumn: value })}
            />
            <FieldSelect
              label="Y column"
              value={settings.heatmapYColumn}
              options={columnOptions.filter((opt) => opt.value !== settings.xColumn)}
              onChange={(value) => update({ heatmapYColumn: value })}
            />
            <FieldSelect
              label="Value column"
              value={settings.valueColumn || settings.yColumn}
              options={numericOptions.length > 0 ? numericOptions : columnOptions}
              onChange={(value) => update({ valueColumn: value })}
            />
          </>
        ) : (
          <>
            <FieldSelect
              label={isScatter ? "X column (numeric)" : "X column"}
              value={settings.xColumn}
              options={isScatter && numericOptions.length > 0 ? numericOptions : columnOptions}
              onChange={(value) => update({ xColumn: value })}
            />
            <FieldSelect
              label={isScatter ? "Y column (numeric)" : "Y column"}
              value={settings.yColumn}
              options={isScatter && numericOptions.length > 0 ? numericOptions : columnOptions}
              onChange={(value) => update({ yColumn: value, valueColumn: value })}
            />
            {!isScatter ? (
              <FieldSelect
                label="Series (optional)"
                value={settings.seriesColumn}
                options={columnOptions.filter(
                  (opt) => opt.value !== settings.xColumn && opt.value !== settings.yColumn
                )}
                onChange={(value) => update({ seriesColumn: value })}
                allowEmpty
                emptyLabel="Single series"
              />
            ) : null}
          </>
        )}

        {!isScatter ? (
          <FieldSelect
            label="Aggregation"
            value={settings.aggregation}
            options={aggregationOptions}
            onChange={(value) =>
              update({ aggregation: value as ChartSettings["aggregation"] })
            }
          />
        ) : null}

        {!isScatter && !isHeatmap ? (
          <FieldSelect
            label="Value labels"
            value={settings.valueLabels}
            options={VALUE_LABEL_OPTIONS}
            onChange={(value) =>
              update({ valueLabels: value as ChartSettings["valueLabels"] })
            }
          />
        ) : null}
      </aside>

      <div className="chart-canvas-wrap" ref={canvasWrapRef}>
        {warning ? (
          <div className="chart-warning">
            <span className="chart-warning-text">{warning}</span>
            {suggestedBarLayout ? (
              <button
                type="button"
                className="chart-warning-action"
                onClick={() => update({ barLayout: suggestedBarLayout })}
              >
                {horizontalScrollBarLabel}
              </button>
            ) : null}
          </div>
        ) : null}
        {option ? (
          <ReactECharts
            ref={chartRef}
            className="chart-canvas"
            option={option}
            notMerge
            lazyUpdate={!isPie}
            onChartReady={onChartReady}
            style={{ height: "100%", width: "100%" }}
          />
        ) : (
          <div className="chart-empty">{warning ?? "Configure columns to render a chart."}</div>
        )}
      </div>
    </div>
  );
}
