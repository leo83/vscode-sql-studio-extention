import type { StatementResult } from "./types";

interface Props {
  result: StatementResult;
}

export function ExplainPlanView({ result }: Props) {
  const plan = result.plan_text?.trim() || "No execution plan returned.";

  return (
    <div className="explain-plan">
      <div className="explain-plan-header">
        <span className="explain-plan-title">Execution plan</span>
        <span className="explain-plan-meta">{result.duration_ms.toFixed(1)} ms</span>
      </div>
      <pre className="explain-plan-text">{plan}</pre>
    </div>
  );
}
