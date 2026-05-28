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

export interface StatementResult extends QueryResult {
  index: number;
  sql: string;
  plan_text?: string | null;
}

export interface QueryExecuteResult {
  statements: StatementResult[];
  total_duration_ms: number;
}

export type WebviewMode = "results" | "connection";

export type ClickHouseInterface = "http" | "native";

export interface ConnectionTagPayload {
  name: string;
  color: string;
}

export interface ConnectionProfilePayload {
  id?: string;
  name: string;
  dialect: "postgres" | "clickhouse" | "mssql" | "mysql" | "sqlite";
  host: string;
  port: number;
  database: string;
  username: string;
  ssl?: boolean;
  readOnly?: boolean;
  clickhouseInterface?: ClickHouseInterface;
  tags?: ConnectionTagPayload[];
}

export interface ConnectionDialogInit {
  mode: "create" | "edit";
  profile?: ConnectionProfilePayload;
  hasStoredPassword?: boolean;
  dialectIcons?: Partial<
    Record<"postgres" | "clickhouse" | "mssql" | "mysql" | "sqlite", string>
  >;
}

export interface ConnectionFormPayload {
  id?: string;
  name: string;
  dialect: "postgres" | "clickhouse" | "mssql" | "mysql" | "sqlite";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  readOnly: boolean;
  clickhouseInterface?: ClickHouseInterface;
  tags?: ConnectionTagPayload[];
}
