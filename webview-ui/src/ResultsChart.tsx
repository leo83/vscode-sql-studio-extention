import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";
import {
  AGGREGATION_OPTIONS,
  CHART_TYPE_OPTIONS,
  aggregationOptionsForChart,
  buildChartOption,
  defaultChartSettings,
  type ChartSettings,
  type ChartType,
} from "./chartConfig";
import type { ColumnInfo } from "./resultData";

interface Props {
  records: Record<string, unknown>[];
  columns: ColumnInfo[];
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

export function ResultsChart({ records, columns }: Props) {
  const [settings, setSettings] = useState<ChartSettings>(() => defaultChartSettings(columns));

  useEffect(() => {
    setSettings(defaultChartSettings(columns));
  }, [columns]);

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

  const { option, warning } = useMemo(
    () => buildChartOption(records, settings),
    [records, settings]
  );

  const update = (patch: Partial<ChartSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const onChartTypeChange = (chartType: ChartType) => {
    setSettings((prev) => {
      const next: ChartSettings = { ...prev, chartType };
      const aggs = aggregationOptionsForChart(chartType);
      if (!aggs.includes(next.aggregation)) {
        next.aggregation = aggs[0] ?? "sum";
      }
      if (chartType === "pie" && !next.valueColumn) {
        next.valueColumn = next.yColumn;
      }
      return next;
    });
  };

  const isHeatmap = settings.chartType === "heatmap";
  const isPie = settings.chartType === "pie";
  const isScatter = settings.chartType === "scatter";

  return (
    <div className="chart-panel">
      <aside className="chart-config">
        <FieldSelect
          label="Chart type"
          value={settings.chartType}
          options={CHART_TYPE_OPTIONS}
          onChange={(value) => onChartTypeChange(value as ChartType)}
        />

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
      </aside>

      <div className="chart-canvas-wrap">
        {warning ? <div className="chart-warning">{warning}</div> : null}
        {option ? (
          <ReactECharts
            className="chart-canvas"
            option={option}
            notMerge
            lazyUpdate
            style={{ height: "100%", width: "100%" }}
          />
        ) : (
          <div className="chart-empty">{warning ?? "Configure columns to render a chart."}</div>
        )}
      </div>
    </div>
  );
}
