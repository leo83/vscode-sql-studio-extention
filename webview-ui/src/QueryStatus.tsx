import type { QueryResult } from "./types";

interface Props {
  result: QueryResult;
  compact?: boolean;
}

export function QueryStatus({ result, compact = false }: Props) {
  const message = result.status_message?.trim() || "Query executed successfully.";

  return (
    <div className={`query-status${compact ? " query-status-compact" : ""}`}>
      {!compact ? (
        <div className="query-status-header">
          <span className="query-status-title">Query completed</span>
          <span className="query-status-meta">{result.duration_ms.toFixed(1)} ms</span>
        </div>
      ) : null}
      <p className="query-status-message">{message}</p>
      {result.row_count > 0 ? (
        <p className="query-status-detail">{result.row_count} rows affected</p>
      ) : null}
    </div>
  );
}
