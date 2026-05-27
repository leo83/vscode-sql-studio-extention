import { useMemo, useState } from "react";
import { parseQueryError } from "./parseQueryError";
import { getVsCodeApi } from "./vscodeApi";

interface Props {
  error: string;
  compact?: boolean;
}

export function QueryError({ error, compact = false }: Props) {
  const parsed = useMemo(() => parseQueryError(error), [error]);
  const [copied, setCopied] = useState(false);
  const stackLines = parsed.stackTrace?.split("\n").length ?? 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(parsed.raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      getVsCodeApi()?.postMessage({ type: "copyError", text: parsed.raw });
    }
  };

  return (
    <div className={`query-error${compact ? " query-error-compact" : ""}`}>
      {!compact ? (
        <div className="query-error-header">
          <span className="query-error-title">Query failed</span>
          <button type="button" className="secondary" onClick={handleCopy}>
            {copied ? "Copied" : "Copy error"}
          </button>
        </div>
      ) : (
        <div className="query-error-header">
          <span className="query-error-title">Failed</span>
          <button type="button" className="secondary" onClick={handleCopy}>
            {copied ? "Copied" : "Copy"}
          </button>
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
