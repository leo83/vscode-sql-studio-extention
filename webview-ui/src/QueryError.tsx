import { useMemo, useState } from "react";
import { IconCheck, IconCopy, IconRefresh } from "./Icons";
import { parseQueryError } from "./parseQueryError";
import { getVsCodeApi } from "./vscodeApi";

interface Props {
  error: string;
  compact?: boolean;
}

export function QueryError({ error, compact = false }: Props) {
  const parsed = useMemo(() => parseQueryError(error), [error]);
  const [copiedError, setCopiedError] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const stackLines = parsed.stackTrace?.split("\n").length ?? 0;

  const handleCopyError = async () => {
    try {
      await navigator.clipboard.writeText(parsed.message);
      setCopiedError(true);
      window.setTimeout(() => setCopiedError(false), 2000);
    } catch {
      getVsCodeApi()?.postMessage({ type: "copyError", text: parsed.message });
    }
  };

  const handleCopyFull = async () => {
    try {
      await navigator.clipboard.writeText(parsed.raw);
      setCopiedFull(true);
      window.setTimeout(() => setCopiedFull(false), 2000);
    } catch {
      getVsCodeApi()?.postMessage({ type: "copyError", text: parsed.raw });
    }
  };

  return (
    <div className={`query-error${compact ? " query-error-compact" : ""}`}>
      {!compact ? (
        <div className="query-error-header">
          <span className="query-error-title">Query failed</span>
          <div className="query-error-actions">
            <button type="button" className="secondary" onClick={handleCopyError}>
              {copiedError ? <><IconCheck />Copied</> : <><IconCopy />Copy error</>}
            </button>
            <button type="button" className="secondary" onClick={handleCopyFull}>
              {copiedFull ? <><IconCheck />Copied</> : <><IconCopy />Copy full message</>}
            </button>
            <button type="button" className="secondary" title="Re-run the same query" onClick={() => getVsCodeApi()?.postMessage({ type: "refresh" })}>
              <IconRefresh />Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="query-error-header">
          <span className="query-error-title">Failed</span>
          <div className="query-error-actions">
            <button type="button" className="secondary" onClick={handleCopyError}>
              {copiedError ? <><IconCheck />Copied</> : <><IconCopy />Copy</>}
            </button>
            <button type="button" className="secondary" onClick={handleCopyFull}>
              {copiedFull ? <><IconCheck />Copied</> : <><IconCopy />Full</>}
            </button>
            <button type="button" className="secondary" title="Re-run the same query" onClick={() => getVsCodeApi()?.postMessage({ type: "refresh" })}>
              <IconRefresh />Retry
            </button>
          </div>
        </div>
      )}

      {(parsed.code || parsed.hint) && (
        <div className="query-error-badges">
          {parsed.code ? (
            <span className="query-error-badge">Code {parsed.code}</span>
          ) : null}
          {parsed.hint ? (
            <span className="query-error-badge">{parsed.hint}</span>
          ) : null}
        </div>
      )}

      <p className="query-error-summary">{parsed.summary}</p>

      {parsed.stackTrace ? (
        <details className="query-error-stack">
          <summary>
            Stack trace
            {stackLines > 0 ? ` (${stackLines} lines)` : ""}
          </summary>
          <pre>{parsed.stackTrace}</pre>
        </details>
      ) : null}

      <details className="query-error-raw">
        <summary>Full message</summary>
        <pre>{parsed.raw}</pre>
      </details>
    </div>
  );
}
