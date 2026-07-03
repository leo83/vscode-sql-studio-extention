import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { IconBarChart, IconDownload, IconRefresh, IconTable } from "./Icons";
import { ResultsTable } from "./ResultsTable";
import { analyzeColumns, queryResultToRecords } from "./resultData";
import { parseColumnFilter, rowMatchesFilter } from "./columnFilter";
import type { StatementResult } from "./types";
import { getVsCodeApi } from "./vscodeApi";
import { defaultChartSettings, type ChartSettings } from "./chartConfig";

const ResultsChart = lazy(() =>
  import("./ResultsChart").then((module) => ({ default: module.ResultsChart }))
);

type ViewMode = "table" | "chart";

interface Props {
  result: StatementResult;
  embedded?: boolean;
  fetchMode?: "server" | "client";
  serverPageSize?: number;
  onFetchPage?: (offset: number, setBusy: () => void) => void;
  onPageSizeChange?: (pageSize: number, setBusy: () => void) => void;
  onLoadAll?: (permanently: boolean, setBusy: () => void) => void;
}

export function ResultsView({ result, embedded = false, fetchMode, serverPageSize, onFetchPage, onPageSizeChange, onLoadAll }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Owned here (not inside ResultsTable) so the filter survives switching to the
  // chart view and back, and so the chart can render the same filtered subset.
  const [globalFilter, setGlobalFilter] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sqlPreview, setSqlPreview] = useState<{ top: number; left: number; maxWidth: number } | null>(null);
  const sqlAnchorRef = useRef<HTMLSpanElement | null>(null);
  const sqlPreviewCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelSqlPreviewClose = () => {
    if (sqlPreviewCloseTimer.current) {
      clearTimeout(sqlPreviewCloseTimer.current);
      sqlPreviewCloseTimer.current = null;
    }
  };
  const openSqlPreview = () => {
    cancelSqlPreviewClose();
    const rect = sqlAnchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSqlPreview({
      top: rect.bottom + 4,
      left: Math.max(8, rect.left),
      maxWidth: Math.max(320, window.innerWidth - rect.left - 16),
    });
  };
  // Small delay before closing so the pointer can travel from the trigger onto
  // the popover itself (e.g. to scroll a long query) without it disappearing.
  const scheduleSqlPreviewClose = () => {
    cancelSqlPreviewClose();
    sqlPreviewCloseTimer.current = setTimeout(() => setSqlPreview(null), 150);
  };
  useEffect(() => () => cancelSqlPreviewClose(), []);

  const records = useMemo(() => queryResultToRecords(result), [result]);
  const columns = useMemo(() => analyzeColumns(records, result.columns), [records, result.columns]);
  const canChart = records.length > 0 && columns.length > 0;

  const columnNames = useMemo(() => columns.map((col) => col.name), [columns]);
  const colFilter = useMemo(
    () => parseColumnFilter(globalFilter, columnNames),
    [globalFilter, columnNames]
  );
  const isFiltered = colFilter !== null;
  const filteredRecords = useMemo(
    () => (colFilter ? records.filter((row) => rowMatchesFilter(row, colFilter)) : records),
    [records, colFilter]
  );

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
          {isFiltered
            ? `${filteredRecords.length} of ${result.row_count} rows`
            : `${result.row_count} rows`}{" "}
          · {result.duration_ms.toFixed(1)} ms
          {result.has_more ? " · more" : result.truncated ? " · truncated" : ""}
        </span>
        <button
          type="button"
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
        <button type="button" className="secondary" onClick={() => getVsCodeApi()?.postMessage({ type: "exportCsv" })}>
          <IconDownload />Export CSV
        </button>
        <button type="button" className="secondary" onClick={() => getVsCodeApi()?.postMessage({ type: "exportXlsx" })}>
          <IconDownload />Export Excel
        </button>
        {result.sql ? (
          <span
            className="toolbar-sql"
            ref={sqlAnchorRef}
            onMouseEnter={openSqlPreview}
            onMouseLeave={scheduleSqlPreviewClose}
          >
            {result.sql}
          </span>
        ) : null}
      </div>

      {result.sql && sqlPreview ? (
        <div
          className="sql-preview-popover"
          style={{ top: sqlPreview.top, left: sqlPreview.left, maxWidth: sqlPreview.maxWidth }}
          onMouseEnter={cancelSqlPreviewClose}
          onMouseLeave={scheduleSqlPreviewClose}
        >
          <pre>{result.sql}</pre>
        </div>
      ) : null}

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
          globalFilter={globalFilter}
          setGlobalFilter={setGlobalFilter}
        />
      ) : (
        <div className="results-body-only results-chart-host">
          <Suspense fallback={<div className="chart-empty">Loading chart…</div>}>
            <ResultsChart records={filteredRecords} columns={columns} settings={chartSettings} onSettingsChange={setChartSettings} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
