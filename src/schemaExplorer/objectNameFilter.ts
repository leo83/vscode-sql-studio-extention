import { SchemaNodePayload } from "../types";

export function objectFilterKey(connectionId: string, path: string[]): string {
  return `${connectionId}:${path.join("/")}`;
}

export function objectDisplayName(label: string): string {
  return label.split(":")[0]?.trim() ?? label;
}

export function matchesObjectNameFilter(label: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return objectDisplayName(label).toLowerCase().includes(needle);
}

export function filterSchemaNodes(
  nodes: SchemaNodePayload[],
  filter: string | undefined
): SchemaNodePayload[] {
  if (!filter?.trim()) {
    return nodes;
  }
  return nodes.filter((node) => matchesObjectNameFilter(node.label, filter));
}
