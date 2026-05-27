import { ConnectionDialog } from "./ConnectionDialog";
import { QueryError } from "./QueryError";
import { QueryStatus } from "./QueryStatus";
import { ResultsTable } from "./ResultsTable";
import type { ConnectionDialogInit, QueryResult } from "./types";

export function App() {
  const mode = window.__SQL_STUDIO_MODE__ ?? "results";

  if (mode === "connection") {
    const init = window.__SQL_STUDIO_CONNECTION__ as ConnectionDialogInit | undefined;
    if (!init) {
      return <div className="empty">Connection dialog not initialized.</div>;
    }
    return <ConnectionDialog init={init} />;
  }

  const result = window.__SQL_STUDIO_RESULT__ as QueryResult | undefined;
  if (!result) {
    return <div className="empty">No query results.</div>;
  }
  if (result.error) {
    return <QueryError error={result.error} />;
  }
  if (result.columns.length === 0 && result.rows.length === 0) {
    return <QueryStatus result={result} />;
  }
  return <ResultsTable result={result} />;
}
