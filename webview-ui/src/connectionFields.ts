export type Dialect = "postgres" | "clickhouse";
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

const postgresExtras: ConnectionFieldDef[] = [
  {
    key: "ssl",
    label: "Use SSL (sslmode=require)",
    type: "checkbox",
  },
  {
    key: "readOnly",
    label: "Read-only connection",
    type: "checkbox",
    hint: "Sets default_transaction_read_only=on",
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
  return clickhouseInterface === "http" ? 8123 : 9000;
}

export function getConnectionFields(
  dialect: Dialect,
  clickhouseInterface: ClickHouseInterface = "native"
): ConnectionFieldDef[] {
  const extras = dialect === "postgres" ? postgresExtras : clickhouseExtras;
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
