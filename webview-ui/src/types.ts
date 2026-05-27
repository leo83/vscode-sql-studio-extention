export interface QueryColumn {
  name: string;
  data_type?: string | null;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: unknown[][];
  row_count: number;
  duration_ms: number;
  truncated?: boolean;
  error?: string | null;
  status_message?: string | null;
}

export type WebviewMode = "results" | "connection";

export type ClickHouseInterface = "http" | "native";

export interface ConnectionProfilePayload {
  id?: string;
  name: string;
  dialect: "postgres" | "clickhouse";
  host: string;
  port: number;
  database: string;
  username: string;
  ssl?: boolean;
  readOnly?: boolean;
  clickhouseInterface?: ClickHouseInterface;
}

export interface ConnectionDialogInit {
  mode: "create" | "edit";
  profile?: ConnectionProfilePayload;
  hasStoredPassword?: boolean;
}

export interface ConnectionFormPayload {
  id?: string;
  name: string;
  dialect: "postgres" | "clickhouse";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  readOnly: boolean;
  clickhouseInterface?: ClickHouseInterface;
}
