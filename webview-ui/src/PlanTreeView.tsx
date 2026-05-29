import { useMemo, useState, type ReactNode } from "react";
import { getPlanKindCategory } from "./planTreeUtils";
import type { PlanNode } from "./types";

interface Props {
  nodes: PlanNode[];
  searchQuery?: string;
  expandAllSignal?: number;
  collapseAllSignal?: number;
}

interface TreeNodeProps {
  node: PlanNode;
  depth: number;
  searchQuery: string;
  defaultExpanded: boolean;
}

function highlightText(text: string, query: string): ReactNode {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return text;
  }
  const lower = text.toLowerCase();
  const index = lower.indexOf(normalized);
  if (index < 0) {
    return text;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className="plan-search-hit">{text.slice(index, index + normalized.length)}</mark>
      {text.slice(index + normalized.length)}
    </>
  );
}

function PlanTreeNode({ node, depth, searchQuery, defaultExpanded }: TreeNodeProps) {
  const hasChildren = Boolean(node.children?.length);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const category = getPlanKindCategory(node.kind);
  const expensive = node.tags?.includes("expensive");
  const fullScan = node.tags?.includes("full_scan");

  return (
    <div className={`plan-tree-node plan-tree-node-depth-${Math.min(depth, 6)}`}>
      <div className={`plan-tree-row${expensive ? " plan-tree-row-expensive" : ""}`}>
        {hasChildren ? (
          <button
            type="button"
            className="plan-tree-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse node" : "Expand node"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="plan-tree-toggle plan-tree-toggle-spacer" aria-hidden="true" />
        )}
        <span className={`plan-kind-badge plan-kind-${category}`}>{node.kind}</span>
        <div className="plan-tree-main">
          <div className="plan-tree-title">
            {highlightText(node.title, searchQuery)}
            {fullScan ? <span className="plan-tag plan-tag-warning">full scan</span> : null}
            {expensive ? <span className="plan-tag plan-tag-danger">expensive</span> : null}
          </div>
          {node.subtitle ? (
            <div className="plan-tree-subtitle">{highlightText(node.subtitle, searchQuery)}</div>
          ) : null}
        </div>
        {node.metrics?.length ? (
          <div className="plan-tree-metrics">
            {node.metrics.map((metric) => (
              <span key={`${node.id}-${metric.label}`} className="plan-metric-chip">
                <span className="plan-metric-label">{metric.label}</span>
                <span className="plan-metric-value">{metric.value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {hasChildren && expanded ? (
        <div className="plan-tree-children">
          {node.children!.map((child) => (
            <PlanTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              searchQuery={searchQuery}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function depthExpandDefault(node: PlanNode, searchQuery: string, depth: number): boolean {
  if (searchQuery.trim()) {
    return true;
  }
  return depth < 2;
}

export function PlanTreeView({
  nodes,
  searchQuery = "",
  expandAllSignal = 0,
  collapseAllSignal = 0,
}: Props) {
  const defaultExpanded = useMemo(() => {
    void expandAllSignal;
    void collapseAllSignal;
    return expandAllSignal >= collapseAllSignal;
  }, [expandAllSignal, collapseAllSignal]);

  if (!nodes.length) {
    return <div className="plan-empty">No plan nodes to display.</div>;
  }

  return (
    <div className="plan-tree-view" role="tree">
      {nodes.map((node) => (
        <PlanTreeNode
          key={`${node.id}-${expandAllSignal}-${collapseAllSignal}`}
          node={node}
          depth={0}
          searchQuery={searchQuery}
          defaultExpanded={defaultExpanded || depthExpandDefault(node, searchQuery, 0)}
        />
      ))}
    </div>
  );
}
