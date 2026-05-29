import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
} from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { buildGraph } from "./buildGraph";
import { ColumnEdge } from "./ColumnEdge";
import { layoutGraph } from "./layout";
import { parseDbml } from "./parseDbml";
import { TableNode } from "./TableNode";
import type { TableNodeData } from "./types";

const nodeTypes = { tableNode: TableNode };
const edgeTypes = { columnEdge: ColumnEdge };

export interface DbmlErDiagramHandle {
  fitView: () => void;
  getZoomPercent: () => number;
  isFitView: () => boolean;
}

interface InnerProps {
  dbml: string;
  onReady?: () => void;
  onViewportChange?: (zoomPercent: number, isFit: boolean) => void;
}

function DbmlErDiagramInner(
  { dbml, onReady, onViewportChange }: InnerProps,
  ref: React.ForwardedRef<DbmlErDiagramHandle>
) {
  const { fitView, getZoom } = useReactFlow();

  const { nodes, edges, parseError } = useMemo(() => {
    try {
      const schema = parseDbml(dbml);
      const graph = buildGraph(schema);
      return {
        parseError: null as string | null,
        nodes: layoutGraph(graph.nodes, graph.edges),
        edges: graph.edges,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        parseError: message,
        nodes: [] as Node<TableNodeData>[],
        edges: [] as Edge[],
      };
    }
  }, [dbml]);

  const notifyViewport = useCallback(() => {
    const zoom = getZoom();
    onViewportChange?.(Math.round(zoom * 100), false);
  }, [getZoom, onViewportChange]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.12, duration: 200 });
    window.setTimeout(() => {
      onViewportChange?.(Math.round(getZoom() * 100), true);
    }, 220);
  }, [fitView, getZoom, onViewportChange]);

  useImperativeHandle(
    ref,
    () => ({
      fitView: handleFitView,
      getZoomPercent: () => Math.round(getZoom() * 100),
      isFitView: () => false,
    }),
    [getZoom, handleFitView]
  );

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      fitView({ padding: 0.12, duration: 0 });
      onReady?.();
      onViewportChange?.(Math.round(getZoom() * 100), true);
    });
    return () => cancelAnimationFrame(frame);
  }, [nodes, edges, dbml, fitView, getZoom, onReady, onViewportChange]);

  if (parseError) {
    return <div className="er-diagram__error">{parseError}</div>;
  }

  if (nodes.length === 0) {
    return <div className="er-diagram__error">No tables found in DBML.</div>;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView={false}
      minZoom={0.08}
      maxZoom={4}
      panOnScroll
      zoomOnPinch
      zoomOnScroll
      zoomActivationKeyCode={["Control", "Meta"]}
      selectionOnDrag={false}
      nodesConnectable={false}
      nodesDraggable
      proOptions={{ hideAttribution: true }}
      onMoveEnd={notifyViewport}
      onPaneClick={notifyViewport}
      className="dbml-er-flow"
    >
      <Background gap={20} size={1} className="dbml-er-flow__background" />
    </ReactFlow>
  );
}

const DbmlErDiagramInnerWithRef = forwardRef(DbmlErDiagramInner);

export interface DbmlErDiagramProps {
  dbml: string;
  onReady?: () => void;
  onViewportChange?: (zoomPercent: number, isFit: boolean) => void;
}

export const DbmlErDiagram = forwardRef<DbmlErDiagramHandle, DbmlErDiagramProps>(
  function DbmlErDiagram(props, ref) {
    return (
      <ReactFlowProvider>
        <DbmlErDiagramInnerWithRef ref={ref} {...props} />
      </ReactFlowProvider>
    );
  }
);
