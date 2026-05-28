import { lazy, Suspense, useMemo, useState } from "react";
import { ResultsTable } from "./ResultsTable";
import { analyzeColumns, queryResultToRecords } from "./resultData";
import type { QueryResult } from "./types";
import { getVsCodeApi } from "./vscodeApi";

const ResultsChart = lazy(() =>
  import("./ResultsChart").then((module) => ({ default: module.ResultsChart }))
);

type ViewMode = "table" | "chart";

interface Props {
  result: QueryResult;
  embedded?: boolean;
}

export function ResultsView({ result, embedded = false }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const records = useMemo(() => queryResultToRecords(result), [result]);
  const columns = useMemo(() => analyzeColumns(records, result.columns), [records, result.columns]);
  const canChart = records.length > 0 && columns.length > 0;

  return (
    <div className={`results${embedded ? " results-embedded" : ""}`}>
      <div className="toolbar">
        <div className="view-mode-toggle" role="tablist" aria-label="Results view">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "table"}
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
          >
            Table
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "chart"}
            className={viewMode === "chart" ? "active" : ""}
            onClick={() => setViewMode("chart")}
            disabled={!canChart}
            title={canChart ? undefined : "No data to chart"}
          >
            Chart
          </button>
        </div>
        <span className="meta">
          {result.row_count} rows · {result.duration_ms.toFixed(1)} ms
          {result.truncated ? " · truncated" : ""}
        </span>
        <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "exportCsv" })}>
          Export CSV
        </button>
        <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "exportXlsx" })}>
          Export Excel
        </button>
      </div>

      {viewMode === "table" ? (
        <ResultsTable result={result} embedded={embedded} showToolbar={false} />
      ) : (
        <div className="results-body-only results-chart-host">
          <Suspense fallback={<div className="chart-empty">Loading chart…</div>}>
            <ResultsChart records={records} columns={columns} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
