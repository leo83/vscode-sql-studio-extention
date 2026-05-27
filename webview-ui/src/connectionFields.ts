export type Dialect = "postgres" | "clickhouse" | "mssql";
export type ClickHouseInterface = "http" | "native";

export const CLICKHOUSE_INTERFACE_OPTIONS: FieldOption[] = [
  { label: "Native (TCP, port 9000)", value: "native" },
  { label: "HTTP (port 8123)", value: "http" },
];

export type FieldType = "text" | "password" | "number" | "checkbox" | "select";

export interface FieldOption {
  label: string;
  value: string;
}

export interface ConnectionFieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: FieldOption[];
}

export const DIALECT_OPTIONS: FieldOption[] = [
  { label: "PostgreSQL", value: "postgres" },
  { label: "ClickHouse", value: "clickhouse" },
  { label: "Microsoft SQL Server", value: "mssql" },
];

const baseConnectionFields: ConnectionFieldDef[] = [
  {
    key: "host",
    label: "Host",
    type: "text",
    required: true,
    placeholder: "localhost",
  },
  {
    key: "port",
    label: "Port",
    type: "number",
    required: true,
    placeholder: "8123",
  },
  {
    key: "database",
    label: "Database",
    type: "text",
    required: true,
  },
  {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
  },
  {
    key: "password",
    label: "Password",
    type: "password",
    placeholder: "Leave empty to keep current",
    hint: "Stored securely in VS Code Secret Storage",
  },
];

const sqlExtras: ConnectionFieldDef[] = [
  {
    key: "ssl",
    label: "Use encrypted connection (TLS)",
    type: "checkbox",
  },
  {
    key: "readOnly",
    label: "Read-only connection",
    type: "checkbox",
  },
];

const clickhouseInterfaceField: ConnectionFieldDef = {
  key: "clickhouseInterface",
  label: "Driver",
  type: "select",
  options: CLICKHOUSE_INTERFACE_OPTIONS,
  hint: "TablePlus «Native Driver» = Native (TCP)",
};

const clickhouseExtras: ConnectionFieldDef[] = [
  {
    key: "ssl",
    label: "Use secure connection (TLS)",
    type: "checkbox",
  },
  {
    key: "readOnly",
    label: "Read-only connection",
    type: "checkbox",
    hint: "ClickHouse readonly=1 setting",
  },
];

export function defaultPort(
  dialect: Dialect,
  clickhouseInterface: ClickHouseInterface = "native"
): number {
  if (dialect === "postgres") {
    return 5432;
  }
  if (dialect === "mssql") {
    return 1433;
  }
  return clickhouseInterface === "http" ? 8123 : 9000;
}

export function getConnectionFields(
  dialect: Dialect,
  clickhouseInterface: ClickHouseInterface = "native"
): ConnectionFieldDef[] {
  const extras = dialect === "clickhouse" ? clickhouseExtras : sqlExtras;
  const chPort = clickhouseInterface === "http" ? "8123" : "9000";
  return [
    ...(dialect === "clickhouse" ? [clickhouseInterfaceField] : []),
    ...baseConnectionFields.map((field) => {
      if (field.key === "port" && dialect === "clickhouse") {
        return {
          ...field,
          placeholder: chPort,
          hint:
            clickhouseInterface === "http"
              ? "HTTP port (8123 or 8443)"
              : "Native TCP port (9000 or 9440)",
        };
      }
      if (field.key === "port" && dialect === "mssql") {
        return { ...field, placeholder: "1433" };
      }
      if (field.key === "database" && dialect === "clickhouse") {
        return {
          ...field,
          label: "Database",
          required: false,
          placeholder: "default (optional)",
        };
      }
      if (field.key === "database" && dialect === "postgres") {
        return { ...field, placeholder: "postgres" };
      }
      if (field.key === "database" && dialect === "mssql") {
        return { ...field, placeholder: "master" };
      }
      return field;
    }),
    ...extras,
  ];
}

export const NAME_FIELD: ConnectionFieldDef = {
  key: "name",
  label: "Connection name",
  type: "text",
  required: true,
  placeholder: "My database",
};
