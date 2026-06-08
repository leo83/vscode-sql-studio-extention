import type { PlanNode } from "./types";

export interface FlatPlanNode {
  id: string;
  depth: number;
  kind: string;
  title: string;
  subtitle?: string | null;
  metricsText: string;
  tags: string[];
  node: PlanNode;
}

export type PlanKindCategory =
  | "scan"
  | "filter"
  | "join"
  | "aggregate"
  | "sort"
  | "limit"
  | "network"
  | "other";

export function countPlanNodes(nodes: PlanNode[] | null | undefined): number {
  if (!nodes?.length) {
    return 0;
  }
  return nodes.reduce((total, node) => total + 1 + countPlanNodes(node.children), 0);
}

export function flattenPlanTree(nodes: PlanNode[], depth = 0): FlatPlanNode[] {
  const rows: FlatPlanNode[] = [];
  for (const node of nodes) {
    rows.push({
      id: node.id,
      depth,
      kind: node.kind,
      title: node.title,
      subtitle: node.subtitle,
      metricsText: (node.metrics ?? []).map((metric) => `${metric.label}: ${metric.value}`).join(", "),
      tags: node.tags ?? [],
      node,
    });
    if (node.children?.length) {
      rows.push(...flattenPlanTree(node.children, depth + 1));
    }
  }
  return rows;
}

export function getPlanKindCategory(kind: string): PlanKindCategory {
  const normalized = kind.toLowerCase();
  if (
    /scan|read|seq|index|merge|table|lookup|fetch|open|materialize|bitmap heap scan/.test(
      normalized
    )
  ) {
    return "scan";
  }
  if (/filter|where|condition|recheck|assert/.test(normalized)) {
    return "filter";
  }
  if (/join|nested loop|hash join|merge join|loop/.test(normalized)) {
    return "join";
  }
  if (/aggregate|group|hash aggregate|window|distinct/.test(normalized)) {
    return "aggregate";
  }
  if (/sort|order|top/.test(normalized)) {
    return "sort";
  }
  if (/limit|offset|result|project|expression|compute scalar|stream aggregate/.test(normalized)) {
    return "limit";
  }
  if (/remote|exchange|distributed|gather|broadcast|shuffle|network|distribute/.test(normalized)) {
    return "network";
  }
  return "other";
}

export function nodeMatchesSearch(node: PlanNode, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const haystack = [
    node.kind,
    node.title,
    node.subtitle ?? "",
    ...(node.metrics ?? []).flatMap((metric) => [metric.label, String(metric.value)]),
    ...(node.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

export function filterPlanTree(nodes: PlanNode[], query: string): PlanNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return nodes;
  }

  const filtered: PlanNode[] = [];
  for (const node of nodes) {
    const children = filterPlanTree(node.children ?? [], query);
    if (nodeMatchesSearch(node, query) || children.length > 0) {
      filtered.push({
        ...node,
        children,
      });
    }
  }
  return filtered;
}

export function planTreeToJson(nodes: PlanNode[]): string {
  return JSON.stringify(nodes, null, 2);
}

export function planTreeToMarkdown(nodes: PlanNode[], indent = 0): string {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);
  for (const node of nodes) {
    let line = `${prefix}- **${node.kind}**`;
    if (node.title && node.title !== node.kind) {
      line += ` ${node.title}`;
    }
    if (node.subtitle) {
      line += ` (${node.subtitle})`;
    }
    if (node.tags?.length) {
      line += ` [${node.tags.join(", ")}]`;
    }
    if (node.metrics?.length) {
      const metricsStr = node.metrics.map((m) => `${m.label}: ${m.value}`).join(", ");
      line += ` *(${metricsStr})*`;
    }
    lines.push(line);
    if (node.children?.length) {
      lines.push(planTreeToMarkdown(node.children, indent + 1));
    }
  }
  return lines.join("\n");
}

export function defaultPlanViewMode(
  planFormat: string | null | undefined,
  hasTree: boolean,
  hasTableColumns: boolean
): "tree" | "table" | "raw" {
  if (planFormat === "table" && hasTableColumns) {
    return "table";
  }
  if (hasTree) {
    return "tree";
  }
  if (hasTableColumns) {
    return "table";
  }
  return "raw";
}
