export type Dialect = "postgres" | "clickhouse";

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
}

export interface ConnectionWithSecret extends ConnectionProfile {
  password: string;
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

export function secretKeyForConnection(connectionId: string): string {
  return `sql-studio.connection.${connectionId}.password`;
}

export function defaultPort(dialect: Dialect): number {
  return dialect === "postgres" ? 5432 : 8123;
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
  };
}
