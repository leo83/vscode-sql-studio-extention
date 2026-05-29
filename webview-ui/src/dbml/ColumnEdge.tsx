import {
  BaseEdge,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { ColumnEdgeData } from "./types";

function CrowFoot({ x, y, direction }: { x: number; y: number; direction: "left" | "right" }) {
  const sign = direction === "right" ? 1 : -1;
  const points = [
    `${x},${y}`,
    `${x + sign * 10},${y - 6}`,
    `${x + sign * 10},${y + 6}`,
    `${x},${y}`,
    `${x + sign * 14},${y - 10}`,
    `${x + sign * 14},${y}`,
    `${x + sign * 14},${y + 10}`,
  ].join(" ");
  return <polyline points={points} className="dbml-edge__crow" fill="none" />;
}

function OneBar({ x, y }: { x: number; y: number }) {
  return (
    <line
      x1={x}
      y1={y - 8}
      x2={x}
      y2={y + 8}
      className="dbml-edge__bar"
      strokeWidth={2}
    />
  );
}

export function ColumnEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
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

  const manySide = data?.manySide ?? "source";
  const manyAtSource = manySide === "source";

  return (
    <g className="dbml-edge">
      <BaseEdge id={id} path={edgePath} />
      {manyAtSource ? (
        <>
          <CrowFoot x={sourceX} y={sourceY} direction="right" />
          <OneBar x={targetX} y={targetY} />
        </>
      ) : (
        <>
          <OneBar x={sourceX} y={sourceY} />
          <CrowFoot x={targetX} y={targetY} direction="left" />
        </>
      )}
    </g>
  );
}
