export interface DbmlColumn {
  name: string;
  dataType: string;
  isPk: boolean;
  isFk: boolean;
  isNotNull: boolean;
  isUnique: boolean;
}

export interface DbmlTable {
  id: string;
  schemaName: string | null;
  name: string;
  label: string;
  columns: DbmlColumn[];
  note: string | null;
}

export interface DbmlRelationship {
  id: string;
  fromTableId: string;
  fromColumn: string;
  toTableId: string;
  toColumn: string;
  /** many side is the FK table */
  manySide: "from" | "to";
}

export interface DbmlSchema {
  tables: DbmlTable[];
  relationships: DbmlRelationship[];
}

export interface TableNodeData {
  table: DbmlTable;
  [key: string]: unknown;
}

export interface ColumnEdgeData {
  manySide: "source" | "target";
  [key: string]: unknown;
}

export const TABLE_WIDTH = 280;
export const TABLE_HEADER_HEIGHT = 36;
export const TABLE_ROW_HEIGHT = 28;
export const TABLE_PADDING_BOTTOM = 4;

export function tableHeight(columnCount: number): number {
  return TABLE_HEADER_HEIGHT + columnCount * TABLE_ROW_HEIGHT + TABLE_PADDING_BOTTOM;
}

export function columnHandleId(tableId: string, columnName: string): string {
  return `${tableId}::${columnName}`;
}

export function qualifiedTableName(schemaName: string | null, tableName: string): string {
  return schemaName ? `${schemaName}.${tableName}` : tableName;
}
