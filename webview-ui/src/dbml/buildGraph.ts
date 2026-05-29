import type { Edge, Node } from "@xyflow/react";
import type { DbmlSchema, TableNodeData } from "./types";
import {
  TABLE_WIDTH,
  columnHandleId,
  tableHeight,
} from "./types";

export function buildGraph(schema: DbmlSchema): { nodes: Node<TableNodeData>[]; edges: Edge[] } {
  const nodes: Node<TableNodeData>[] = schema.tables.map((table) => ({
    id: table.id,
    type: "tableNode",
    position: { x: 0, y: 0 },
    data: { table },
    draggable: true,
    selectable: false,
    width: TABLE_WIDTH,
    height: tableHeight(table.columns.length),
  }));

  const edges: Edge[] = schema.relationships.map((relationship) => ({
    id: relationship.id,
    type: "columnEdge",
    source: relationship.fromTableId,
    target: relationship.toTableId,
    sourceHandle: `${columnHandleId(relationship.fromTableId, relationship.fromColumn)}-right`,
    targetHandle: `${columnHandleId(relationship.toTableId, relationship.toColumn)}-left`,
    selectable: true,
    data: { manySide: "source" as const },
  }));

  return { nodes, edges };
}
