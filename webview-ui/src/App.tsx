import { BatchResults } from "./BatchResults";
import { ConnectionDialog } from "./ConnectionDialog";
import { QueryError } from "./QueryError";
import { QueryStatus } from "./QueryStatus";
import { ResultsTable } from "./ResultsTable";
import type { ConnectionDialogInit, QueryExecuteResult } from "./types";

export function App() {
  const mode = window.__SQL_STUDIO_MODE__ ?? "results";

  if (mode === "connection") {
    const init = window.__SQL_STUDIO_CONNECTION__ as ConnectionDialogInit | undefined;
    if (!init) {
      return <div className="empty">Connection dialog not initialized.</div>;
    }
    return <ConnectionDialog init={init} />;
  }

  const batch = window.__SQL_STUDIO_RESULT__ as QueryExecuteResult | undefined;
  if (!batch?.statements?.length) {
    return <div className="empty">No query results.</div>;
  }

  if (batch.statements.length > 1) {
    return <BatchResults batch={batch} />;
  }

  const result = batch.statements[0];
  if (result.error) {
    return <QueryError error={result.error} />;
  }
  if (result.rows.length === 0 && !result.columns.length) {
    return <QueryStatus result={result} />;
  }
  return <ResultsTable result={result} />;
}
