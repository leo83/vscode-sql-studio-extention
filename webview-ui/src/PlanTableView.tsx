import { useMemo } from "react";
import { flattenPlanTree } from "./planTreeUtils";
import type { PlanNode } from "./types";

interface Props {
  nodes: PlanNode[];
}

export function PlanTableView({ nodes }: Props) {
  const rows = useMemo(() => flattenPlanTree(nodes), [nodes]);

  if (!rows.length) {
    return <div className="plan-empty">No plan nodes to display.</div>;
  }

  return (
    <div className="plan-table-wrap">
      <table className="plan-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Kind</th>
            <th>Metrics</th>
            <th>Depth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.tags.includes("expensive") ? "plan-table-row-expensive" : undefined}>
              <td>
                <div className="plan-table-node" style={{ paddingLeft: `${row.depth * 16}px` }}>
                  <div className="plan-table-title">{row.title}</div>
                  {row.subtitle ? <div className="plan-table-subtitle">{row.subtitle}</div> : null}
                </div>
              </td>
              <td>{row.kind}</td>
              <td>{row.metricsText || "—"}</td>
              <td>{row.depth}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
