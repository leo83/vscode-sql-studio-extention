import { QueryError } from "./QueryError";
import { QueryStatus } from "./QueryStatus";
import { ResultsView } from "./ResultsView";
import type { QueryExecuteResult, StatementResult } from "./types";

interface Props {
  batch: QueryExecuteResult;
}

function sqlPreview(sql: string, maxLen = 120): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) {
    return oneLine;
  }
  return `${oneLine.slice(0, maxLen)}…`;
}

function StatementBlock({ statement }: { statement: StatementResult }) {
  const title = `Statement ${statement.index}`;

  if (statement.error) {
    return (
      <section className="batch-statement batch-statement-error">
        <header className="batch-statement-header">
          <span className="batch-statement-title">{title}</span>
          <span className="batch-statement-meta">{statement.duration_ms.toFixed(1)} ms</span>
        </header>
        <pre className="batch-statement-sql">{sqlPreview(statement.sql, 500)}</pre>
        <QueryError error={statement.error} compact />
      </section>
    );
  }

  const hasTable = statement.rows.length > 0;

  return (
    <section className={`batch-statement${hasTable ? " batch-statement-table" : ""}`}>
      <header className="batch-statement-header">
        <span className="batch-statement-title">{title}</span>
        <span className="batch-statement-meta">{statement.duration_ms.toFixed(1)} ms</span>
      </header>
      <pre className="batch-statement-sql">{sqlPreview(statement.sql, 500)}</pre>
      {hasTable ? (
        <ResultsView result={statement} embedded />
      ) : (
        <QueryStatus result={statement} compact />
      )}
    </section>
  );
}

export function BatchResults({ batch }: Props) {
  const count = batch.statements.length;
  const failed = batch.statements.filter((s) => s.error).length;

  return (
    <div className="batch-results">
      <header className="batch-results-header">
        <span className="batch-results-title">
          {count} statement{count === 1 ? "" : "s"} completed
          {failed > 0 ? ` · ${failed} failed` : ""}
        </span>
        <span className="batch-results-meta">{batch.total_duration_ms.toFixed(1)} ms total</span>
      </header>
      {batch.statements.map((statement) => (
        <StatementBlock key={statement.index} statement={statement} />
      ))}
    </div>
  );
}
