import { Parser } from "@dbml/core";
import type { DbmlColumn, DbmlRelationship, DbmlSchema, DbmlTable } from "./types";
import { qualifiedTableName } from "./types";

interface ExportedField {
  name: string;
  type?: { type_name?: string; args?: string | null };
  pk?: boolean;
  not_null?: boolean;
  unique?: boolean;
}

interface ExportedTable {
  name: string;
  note?: string | null;
  fields?: ExportedField[];
}

interface ExportedEndpoint {
  schemaName?: string | null;
  tableName: string;
  fieldNames: string[];
  relation: string;
}

interface ExportedRef {
  endpoints: ExportedEndpoint[];
}

interface ExportedSchema {
  name: string;
  tables?: ExportedTable[];
  refs?: ExportedRef[];
}

interface ExportedDatabase {
  schemas: ExportedSchema[];
}

function formatDataType(field: ExportedField): string {
  const typeName = field.type?.type_name ?? "unknown";
  const args = field.type?.args;
  return args ? `${typeName}(${args})` : typeName;
}

function tableId(schemaName: string, tableName: string): string {
  return qualifiedTableName(schemaName, tableName);
}

function formatDbmlParseError(err: unknown): string {
  if (err && typeof err === "object" && "diags" in err) {
    const diags = (err as { diags: Array<{ message?: string }> }).diags ?? [];
    const messages = diags.map((diag) => diag.message).filter(Boolean);
    if (messages.length > 0) {
      return messages.join("\n");
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function parseDbml(dbml: string): DbmlSchema {
  const parser = new Parser();
  let database;
  try {
    database = parser.parse(dbml, "dbml");
  } catch (err) {
    throw new Error(formatDbmlParseError(err));
  }
  const exported = database.export() as ExportedDatabase;

  const fkColumns = new Set<string>();
  const relationships: DbmlRelationship[] = [];

  for (const schema of exported.schemas) {
    for (const ref of schema.refs ?? []) {
      const endpoints = ref.endpoints ?? [];
      if (endpoints.length < 2) {
        continue;
      }
      const manyEndpoint = endpoints.find((endpoint) => endpoint.relation === "*") ?? endpoints[0];
      const oneEndpoint = endpoints.find((endpoint) => endpoint.relation === "1") ?? endpoints[1];
      if (!manyEndpoint || !oneEndpoint) {
        continue;
      }

      const fromSchema = manyEndpoint.schemaName ?? schema.name;
      const toSchema = oneEndpoint.schemaName ?? schema.name;
      const fromTableId = tableId(fromSchema, manyEndpoint.tableName);
      const toTableId = tableId(toSchema, oneEndpoint.tableName);
      const fromColumn = manyEndpoint.fieldNames[0];
      const toColumn = oneEndpoint.fieldNames[0];
      if (!fromColumn || !toColumn) {
        continue;
      }

      fkColumns.add(`${fromTableId}::${fromColumn}`);
      relationships.push({
        id: `${fromTableId}.${fromColumn}->${toTableId}.${toColumn}`,
        fromTableId,
        fromColumn,
        toTableId,
        toColumn,
        manySide: "from",
      });
    }
  }

  const tables: DbmlTable[] = [];
  for (const schema of exported.schemas) {
    for (const table of schema.tables ?? []) {
      const id = tableId(schema.name, table.name);
      const columns: DbmlColumn[] = (table.fields ?? []).map((field) => ({
        name: field.name,
        dataType: formatDataType(field),
        isPk: Boolean(field.pk),
        isFk: fkColumns.has(`${id}::${field.name}`),
        isNotNull: Boolean(field.not_null),
        isUnique: Boolean(field.unique),
      }));

      tables.push({
        id,
        schemaName: schema.name,
        name: table.name,
        label: qualifiedTableName(schema.name, table.name),
        columns,
        note: table.note ?? null,
      });
    }
  }

  tables.sort((left, right) => left.label.localeCompare(right.label));
  return { tables, relationships };
}
