import { ResultsTable } from "./ResultsTable";
import type { QueryResult } from "./types";

export function App() {
  const result = window.__SQL_STUDIO_RESULT__ as QueryResult | undefined;
  if (!result) {
    return <div className="empty">No query results.</div>;
  }
  if (result.error) {
    return <div className="error">Error: {result.error}</div>;
  }
  return <ResultsTable result={result} />;
}
