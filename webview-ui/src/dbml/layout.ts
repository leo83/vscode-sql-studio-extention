import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { TableNodeData } from "./types";
import { TABLE_WIDTH } from "./types";

const NODE_SEP = 80;
const RANK_SEP = 100;

export function layoutGraph(nodes: Node<TableNodeData>[], edges: Edge[]): Node<TableNodeData>[] {
  if (nodes.length === 0) {
    return nodes;
  }

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "TB",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: node.width ?? TABLE_WIDTH,
      height: node.height ?? 120,
    });
  }

  for (const edge of edges) {
    // Rank parent (PK / target) above child (FK / source) in top-to-bottom layout.
    graph.setEdge(edge.target, edge.source);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const layoutNode = graph.node(node.id);
    const width = node.width ?? TABLE_WIDTH;
    const height = node.height ?? 120;
    return {
      ...node,
      position: {
        x: layoutNode.x - width / 2,
        y: layoutNode.y - height / 2,
      },
    };
  });
}
