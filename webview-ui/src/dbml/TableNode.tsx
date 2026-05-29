import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { TableNodeData } from "./types";
import {
  TABLE_WIDTH,
  columnHandleId,
} from "./types";

export function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const { table } = data;

  return (
    <div className="dbml-table" style={{ width: TABLE_WIDTH }}>
      <div className="dbml-table__header" title={table.note ?? undefined}>
        {table.label}
      </div>
      <div className="dbml-table__body">
        {table.columns.map((column) => {
          const baseHandleId = columnHandleId(table.id, column.name);
          return (
            <div key={column.name} className="dbml-table__row">
              <Handle
                id={`${baseHandleId}-left`}
                type="target"
                position={Position.Left}
                className="dbml-table__handle"
              />
              <Handle
                id={`${baseHandleId}-right`}
                type="source"
                position={Position.Right}
                className="dbml-table__handle"
              />
              <span className="dbml-table__icon" aria-hidden="true">
                {column.isPk ? "🔑" : column.isFk ? "🔗" : ""}
              </span>
              <span className="dbml-table__col-name">{column.name}</span>
              <span className="dbml-table__col-type">{column.dataType}</span>
              {column.isNotNull ? <span className="dbml-table__badge">NN</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
