import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconBarChart, IconDownload, IconRefresh, IconTable } from "./Icons";
import { ResultsTable } from "./ResultsTable";
import { analyzeColumns, queryResultToRecords } from "./resultData";
import type { QueryResult } from "./types";
import { getVsCodeApi } from "./vscodeApi";
import { defaultChartSettings, type ChartSettings } from "./chartConfig";

const ResultsChart = lazy(() =>
  import("./ResultsChart").then((module) => ({ default: module.ResultsChart }))
);

type ViewMode = "table" | "chart";

interface Props {
  result: QueryResult;
  embedded?: boolean;
  fetchMode?: "server" | "client";
  serverPageSize?: number;
  onFetchPage?: (offset: number, setBusy: () => void) => void;
  onPageSizeChange?: (pageSize: number, setBusy: () => void) => void;
  onLoadAll?: (permanently: boolean, setBusy: () => void) => void;
}

export function ResultsView({ result, embedded = false, fetchMode, serverPageSize, onFetchPage, onPageSizeChange, onLoadAll }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [filterState, setFilterState] = useState({ isFiltered: false, filteredCount: 0 });
  const [isBusy, setIsBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const records = useMemo(() => queryResultToRecords(result), [result]);
  const columns = useMemo(() => analyzeColumns(records, result.columns), [records, result.columns]);
  const canChart = records.length > 0 && columns.length > 0;

  const [chartSettings, setChartSettings] = useState<ChartSettings>(() => defaultChartSettings(columns));

  // Stable signature of the column shape — a refresh of the same query produces a new
  // `columns` array identity but the same signature, so the chart config is preserved.
  const columnsKey = useMemo(() => columns.map((c) => `${c.name}:${c.kind}`).join("|"), [columns]);

  // Reset chart settings only when the column structure actually changes (new query).
  useEffect(() => {
    setChartSettings(defaultChartSettings(columns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsKey]);

  // Reset busy state when new result arrives (page fetched or refresh completed)
  useEffect(() => {
    setIsBusy(false);
  }, [result]);

  // Stable + idempotent so the child's report effect cannot trigger a render loop.
  const handleFilterStateChange = useCallback(
    (state: { isFiltered: boolean; filteredCount: number }) => {
      setFilterState((prev) =>
        prev.isFiltered === state.isFiltered && prev.filteredCount === state.filteredCount
          ? prev
          : state
      );
    },
    []
  );

  // Start/stop seconds counter
  useEffect(() => {
    if (isBusy) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedSeconds(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isBusy]);

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
            <IconTable />&nbsp;Table
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
            <IconBarChart />&nbsp;Chart
          </button>
        </div>
        <span className="meta">
          {viewMode === "table" && filterState.isFiltered
            ? `${filterState.filteredCount} of ${result.row_count} rows`
            : `${result.row_count} rows`}{" "}
          · {result.duration_ms.toFixed(1)} ms
          {result.has_more ? " · more" : result.truncated ? " · truncated" : ""}
        </span>
        <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "exportCsv" })}>
          <IconDownload />Export CSV
        </button>
        <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "exportXlsx" })}>
          <IconDownload />Export Excel
        </button>
        <button
          type="button"
          className="secondary"
          title="Re-run the same query"
          disabled={isBusy}
          onClick={() => {
            setIsBusy(true);
            // Preserve the current scope: if we're showing all loaded rows (client
            // display), refresh should reload everything rather than revert to the
            // first server page.
            const loadAll = fetchMode !== "server";
            getVsCodeApi()?.postMessage({ type: "refresh", loadAll });
          }}
        >
          <IconRefresh />Refresh
        </button>
      </div>

      {viewMode === "table" ? (
        <ResultsTable
          result={result}
          embedded={embedded}
          showToolbar={false}
          fetchMode={fetchMode}
          serverPageSize={serverPageSize}
          isBusy={isBusy}
          elapsedSeconds={elapsedSeconds}
          onBusyStart={() => setIsBusy(true)}
          onFetchPage={onFetchPage}
          onPageSizeChange={onPageSizeChange}
          onLoadAll={onLoadAll}
          onFilterStateChange={handleFilterStateChange}
        />
      ) : (
        <div className="results-body-only results-chart-host">
          <Suspense fallback={<div className="chart-empty">Loading chart…</div>}>
            <ResultsChart records={records} columns={columns} settings={chartSettings} onSettingsChange={setChartSettings} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
