import type { ConnectionTag } from "./connectionTags";

export type Dialect = "postgres" | "clickhouse" | "mssql" | "mysql" | "sqlite";
export type ClickHouseInterface = "http" | "native";

export interface ConnectionProfile {
  id: string;
  name: string;
  dialect: Dialect;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl?: boolean;
  readOnly?: boolean;
  /** ClickHouse only: native TCP (9000) or HTTP (8123). */
  clickhouseInterface?: ClickHouseInterface;
  /** Optional colored labels shown in Database Explorer. */
  tags?: ConnectionTag[];
}

export interface ConnectionWithSecret extends ConnectionProfile {
  password: string;
}

export type PlanFormat = "tree" | "table" | "text";

export interface PlanMetric {
  label: string;
  value: string | number;
}

export interface PlanNode {
  id: string;
  kind: string;
  title: string;
  subtitle?: string | null;
  metrics?: PlanMetric[];
  tags?: string[];
  children?: PlanNode[];
}

export interface QueryColumn {
  name: string;
  data_type?: string | null;
}

export interface QueryResultPayload {
  columns: QueryColumn[];
  rows: unknown[][];
  row_count: number;
  duration_ms: number;
  truncated?: boolean;
  error?: string | null;
  status_message?: string | null;
}

export interface StatementResultPayload extends QueryResultPayload {
  index: number;
  sql: string;
  plan_text?: string | null;
  plan_tree?: PlanNode[] | null;
  plan_format?: PlanFormat | null;
}

export interface QueryExecutePayload {
  statements: StatementResultPayload[];
  total_duration_ms: number;
}

export interface LargeTableWarningPayload {
  table: string;
  row_estimate: number;
  message: string;
}

export interface CheckUnboundedSelectPayload {
  warnings: LargeTableWarningPayload[];
}

export function batchHasError(batch: QueryExecutePayload): boolean {
  return batch.statements.some((s) => Boolean(s.error));
}

/** Last statement with a tabular result, for export. */
export function lastExportableStatement(
  batch: QueryExecutePayload
): StatementResultPayload | undefined {
  for (let i = batch.statements.length - 1; i >= 0; i--) {
    const s = batch.statements[i];
    if (s.columns.length > 0 && s.rows.length > 0 && !s.error) {
      return s;
    }
  }
  return undefined;
}

export interface SchemaNodePayload {
  id: string;
  label: string;
  node_type: string;
  path: string[];
  has_children: boolean;
  icon?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ObjectDescriptionSection {
  title: string;
  rows: Record<string, unknown>[];
}

export interface ObjectDescriptionColumn {
  name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key: boolean;
  default?: string | null;
  comment?: string | null;
}

export interface ObjectDescriptionPayload {
  object_type: string;
  qualified_name: string;
  ddl?: string | null;
  columns: ObjectDescriptionColumn[];
  sections: ObjectDescriptionSection[];
}

export interface SchemaDbmlPayload {
  scope: string;
  dbml: string;
  table_count: number;
  relationship_count: number;
}

export function secretKeyForConnection(connectionId: string): string {
  return `sql-studio.connection.${connectionId}.password`;
}

export function languageForDialect(dialect: Dialect): string {
  switch (dialect) {
    case "clickhouse":
      return "sql-studio-clickhouse";
    case "mssql":
      return "sql-studio-mssql";
    case "mysql":
      return "sql-studio-mysql";
    case "sqlite":
      return "sql-studio-sqlite";
    default:
      return "sql-studio-postgres";
  }
}

export function defaultPort(
  dialect: Dialect,
  clickhouseInterface?: ClickHouseInterface
): number {
  if (dialect === "postgres") {
    return 5432;
  }
  if (dialect === "mssql") {
    return 1433;
  }
  if (dialect === "mysql") {
    return 3306;
  }
  if (dialect === "sqlite") {
    return 0;
  }
  return clickhouseInterface === "http" ? 8123 : 9000;
}

export function toRpcConnection(profile: ConnectionWithSecret): Record<string, unknown> {
  return {
    id: profile.id,
    dialect: profile.dialect,
    host: profile.host,
    port: profile.port,
    database: profile.database,
    username: profile.username,
    password: profile.password,
    ssl: profile.ssl ?? false,
    read_only: profile.readOnly ?? false,
    clickhouse_interface:
      profile.dialect === "clickhouse"
        ? profile.clickhouseInterface ?? inferClickHouseInterface(profile.port)
        : undefined,
  };
}

export function inferClickHouseInterface(port: number): ClickHouseInterface {
  return port === 8123 || port === 8443 ? "http" : "native";
}
