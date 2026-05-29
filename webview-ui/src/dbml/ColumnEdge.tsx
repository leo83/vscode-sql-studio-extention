import { useCallback, useRef, type PointerEvent } from "react";
import {
  BaseEdge,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { ColumnEdgeData } from "./types";

function arrowMarkerId(edgeId: string): string {
  return `dbml-arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function ColumnEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<Edge<ColumnEdgeData>>) {
  const { setEdges, screenToFlowPosition } = useReactFlow();
  const dragRef = useRef(false);

  const routeCenterX = data?.routeCenterX;
  const routeCenterY = data?.routeCenterY;
  const hasCustomRoute = routeCenterX != null && routeCenterY != null;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    ...(hasCustomRoute ? { centerX: routeCenterX, centerY: routeCenterY } : {}),
  });

  const controlX = hasCustomRoute ? routeCenterX : labelX;
  const controlY = hasCustomRoute ? routeCenterY : labelY;
  const markerId = arrowMarkerId(id);

  const updateRouteCenter = useCallback(
    (x: number, y: number) => {
      setEdges((edges) =>
        edges.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  routeCenterX: x,
                  routeCenterY: y,
                },
              }
            : edge
        )
      );
    },
    [id, setEdges]
  );

  const onControlPointerDown = useCallback(
    (event: PointerEvent<SVGCircleElement>) => {
      event.stopPropagation();
      dragRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    []
  );

  const onControlPointerMove = useCallback(
    (event: PointerEvent<SVGCircleElement>) => {
      if (!dragRef.current) {
        return;
      }
      event.stopPropagation();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      updateRouteCenter(position.x, position.y);
    },
    [screenToFlowPosition, updateRouteCenter]
  );

  const onControlPointerUp = useCallback((event: PointerEvent<SVGCircleElement>) => {
    dragRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <g className={`dbml-edge${selected ? " dbml-edge--selected" : ""}`}>
      <defs>
        <marker
          id={markerId}
          viewBox="0 -5 10 10"
          refX={10}
          refY={0}
          markerWidth={8}
          markerHeight={8}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,-5 L10,0 L0,5 Z" className="dbml-edge__arrow" />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={18}
        className={selected ? "dbml-edge__path dbml-edge__path--animated" : "dbml-edge__path"}
        markerEnd={`url(#${markerId})`}
      />
      {selected ? (
        <circle
          cx={controlX}
          cy={controlY}
          r={6}
          className="dbml-edge__control nodrag nopan"
          onPointerDown={onControlPointerDown}
          onPointerMove={onControlPointerMove}
          onPointerUp={onControlPointerUp}
        />
      ) : null}
    </g>
  );
}
