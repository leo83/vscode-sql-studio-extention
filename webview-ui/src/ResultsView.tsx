import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { IconBarChart, IconDownload, IconRefresh, IconTable } from "./Icons";
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
  fetchMode?: "server" | "client";
  serverPageSize?: number;
  onFetchPage?: (offset: number, setBusy: () => void) => void;
  onPageSizeChange?: (pageSize: number, setBusy: () => void) => void;
  onLoadAll?: (permanently: boolean, setBusy: () => void) => void;
}

export function ResultsView({ result, embedded = false, fetchMode, serverPageSize, onFetchPage, onPageSizeChange, onLoadAll }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [isBusy, setIsBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const records = useMemo(() => queryResultToRecords(result), [result]);
  const columns = useMemo(() => analyzeColumns(records, result.columns), [records, result.columns]);
  const canChart = records.length > 0 && columns.length > 0;

  // Reset busy state when new result arrives (page fetched or refresh completed)
  useEffect(() => {
    setIsBusy(false);
  }, [result]);

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
          {result.row_count} rows · {result.duration_ms.toFixed(1)} ms
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
            getVsCodeApi()?.postMessage({ type: "refresh" });
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
        />
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
