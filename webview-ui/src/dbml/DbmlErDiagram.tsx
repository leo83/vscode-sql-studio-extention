import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
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

const FIT_VIEW_OPTIONS = { padding: 0.12 } as const;

export interface DbmlErDiagramHandle {
  fitView: () => void;
}

interface InnerProps {
  dbml: string;
}

function DbmlErDiagramInner(
  { dbml }: InnerProps,
  ref: React.ForwardedRef<DbmlErDiagramHandle>
) {
  const { fitView } = useReactFlow();
  const fitDbmlRef = useRef<string | null>(null);

  const { layoutNodes, layoutEdges, parseError } = useMemo(() => {
    try {
      const schema = parseDbml(dbml);
      const graph = buildGraph(schema);
      return {
        parseError: null as string | null,
        layoutNodes: layoutGraph(graph.nodes, graph.edges),
        layoutEdges: graph.edges,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        parseError: message,
        layoutNodes: [] as Node<TableNodeData>[],
        layoutEdges: [] as Edge[],
      };
    }
  }, [dbml]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    fitDbmlRef.current = null;
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [dbml, layoutNodes, layoutEdges, setNodes, setEdges]);

  const runFitView = useCallback(
    (duration: number) => {
      void fitView({ ...FIT_VIEW_OPTIONS, duration });
    },
    [fitView]
  );

  useImperativeHandle(
    ref,
    () => ({
      fitView: () => runFitView(200),
    }),
    [runFitView]
  );

  useEffect(() => {
    if (parseError || layoutNodes.length === 0) {
      return;
    }
    if (fitDbmlRef.current === dbml) {
      return;
    }
    fitDbmlRef.current = dbml;

    const timeout = window.setTimeout(() => {
      runFitView(0);
    }, 64);

    return () => window.clearTimeout(timeout);
  }, [dbml, layoutNodes.length, parseError, runFitView]);

  if (parseError) {
    return <div className="er-diagram__error">{parseError}</div>;
  }

  if (layoutNodes.length === 0) {
    return <div className="er-diagram__error">No tables found in DBML.</div>;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
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
      className="dbml-er-flow"
    >
      <Background gap={20} size={1} className="dbml-er-flow__background" />
      <Controls
        showInteractive={false}
        fitViewOptions={FIT_VIEW_OPTIONS}
        position="bottom-right"
      />
    </ReactFlow>
  );
}

const DbmlErDiagramInnerWithRef = forwardRef(DbmlErDiagramInner);

export interface DbmlErDiagramProps {
  dbml: string;
}

const DbmlErDiagramBody = forwardRef<DbmlErDiagramHandle, DbmlErDiagramProps>(
  function DbmlErDiagramBody(props, ref) {
    return (
      <ReactFlowProvider>
        <DbmlErDiagramInnerWithRef ref={ref} dbml={props.dbml} />
      </ReactFlowProvider>
    );
  }
);

export const DbmlErDiagram = memo(DbmlErDiagramBody);
