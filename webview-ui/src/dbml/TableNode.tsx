import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { TableNodeData } from "./types";
import {
  TABLE_WIDTH,
  columnHandleId,
  columnHandleTop,
} from "./types";

export function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const { table } = data;

  return (
    <div className="dbml-table" style={{ width: TABLE_WIDTH }}>
      <div className="dbml-table__header" title={table.note ?? undefined}>
        {table.label}
      </div>
      <div className="dbml-table__body">
        {table.columns.map((column, columnIndex) => {
          const baseHandleId = columnHandleId(table.id, column.name);
          const handleTop = columnHandleTop(columnIndex);
          const handleStyle = { top: handleTop };
          return (
            <div key={column.name} className="dbml-table__row">
              <Handle
                id={`${baseHandleId}-left`}
                type="target"
                position={Position.Left}
                className="dbml-table__handle"
                style={handleStyle}
              />
              <Handle
                id={`${baseHandleId}-right`}
                type="source"
                position={Position.Right}
                className="dbml-table__handle"
                style={handleStyle}
              />
              <span className="dbml-table__icon" aria-hidden="true">
                {column.isPk ? "🔑" : column.isFk ? "🔗" : ""}
              </span>
              <span className="dbml-table__col-name" title={column.name}>
                {column.name}
              </span>
              <span className="dbml-table__col-type" title={column.dataType}>
                {column.dataType}
              </span>
              {column.isNotNull ? <span className="dbml-table__badge">NN</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
