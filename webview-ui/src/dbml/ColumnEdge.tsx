import {
  BaseEdge,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { ColumnEdgeData } from "./types";

function arrowMarkerId(edgeId: string): string {
  return `dbml-arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function ColumnEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<Edge<ColumnEdgeData>>) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  });

  const markerId = arrowMarkerId(id);

  return (
    <g className="dbml-edge">
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
      <BaseEdge id={id} path={edgePath} markerEnd={`url(#${markerId})`} />
    </g>
  );
}
