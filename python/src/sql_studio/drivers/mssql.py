"""Microsoft SQL Server driver via pyodbc."""

from __future__ import annotations

import time
from typing import Any

import pyodbc

from sql_studio.execution_status import postgres_status
from sql_studio.models import (
    ColumnInfo,
    ConnectionConfig,
    ObjectDescription,
    ObjectDescriptionSection,
    QueryColumn,
    QueryResult,
    SchemaNode,
)

_ODBC_DRIVERS = (
    "ODBC Driver 18 for SQL Server",
    "ODBC Driver 17 for SQL Server",
    "ODBC Driver 13 for SQL Server",
    "SQL Server",
)


class MssqlDriver:
    def __init__(self) -> None:
        self._conn: pyodbc.Connection | None = None
        self._config: ConnectionConfig | None = None

    def connect(self, config: ConnectionConfig) -> None:
        self.disconnect()
        last_error: Exception | None = None
        for driver_name in _ODBC_DRIVERS:
            try:
                self._conn = pyodbc.connect(
                    _connection_string(config, driver_name),
                    timeout=10,
                    autocommit=True,
                )
                self._config = config
                return
            except pyodbc.Error as exc:
                last_error = exc
        raise RuntimeError(
            "Could not connect to SQL Server. Install Microsoft ODBC Driver for SQL Server."
        ) from last_error

    def disconnect(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None
        self._config = None

    def cancel_query(self) -> None:
        if self._conn is not None:
            self._conn.cancel()

    def is_connected_with(self, config: ConnectionConfig) -> bool:
        return self._config == config and self._conn is not None

    def set_active_database(self, database: str) -> None:
        if self._conn is None:
            return
        escaped = database.replace("]", "]]")
        with self._conn.cursor() as cur:
            cur.execute(f"USE [{escaped}]")
        if self._config is not None:
            self._config = self._config.model_copy(update={"database": database})

    def test_connection(self) -> None:
        if self._conn is None:
            raise RuntimeError("Not connected")
        with self._conn.cursor() as cur:
            cur.execute("SELECT 1")

    def execute(self, sql: str, limit: int | None = 10_000) -> QueryResult:
        if self._conn is None:
            raise RuntimeError("Not connected")
        started = time.perf_counter()
        with self._conn.cursor() as cur:
            cur.execute(sql)
            if cur.description is None:
                duration_ms = (time.perf_counter() - started) * 1000
                rowcount = cur.rowcount if cur.rowcount >= 0 else 0
                return QueryResult(
                    columns=[],
                    rows=[],
                    row_count=rowcount,
                    duration_ms=duration_ms,
                    status_message=postgres_status(sql, None, cur.rowcount),
                )
            columns = [
                QueryColumn(name=desc[0], data_type=str(desc[1]))
                for desc in cur.description
            ]
            effective_limit = limit if limit is not None else 10_000
            rows_raw = cur.fetchmany(effective_limit + 1)
            truncated = len(rows_raw) > effective_limit
            if truncated:
                rows_raw = rows_raw[:effective_limit]
            rows = [list(row) for row in rows_raw]
            duration_ms = (time.perf_counter() - started) * 1000
            return QueryResult(
                columns=columns,
                rows=rows,
                row_count=len(rows),
                duration_ms=duration_ms,
                truncated=truncated,
            )

    def list_schema_children(self, path: list[str]) -> list[SchemaNode]:
        if self._conn is None:
            raise RuntimeError("Not connected")
        if not path:
            return [
                SchemaNode(
                    id="schemas",
                    label="Schemas",
                    node_type="folder",
                    path=["schemas"],
                    has_children=True,
                    icon="folder",
                )
            ]
        if path == ["schemas"]:
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT schema_name
                    FROM information_schema.schemata
                    WHERE schema_name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
                      AND schema_name NOT LIKE 'db[_]%'
                    ORDER BY schema_name
                    """
                )
                return [
                    SchemaNode(
                        id=f"schema:{row[0]}",
                        label=row[0],
                        node_type="schema",
                        path=["schemas", row[0]],
                        has_children=True,
                        icon="database",
                    )
                    for row in cur.fetchall()
                ]
        if len(path) == 2 and path[0] == "schemas":
            schema = path[1]
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT table_name, table_type
                    FROM information_schema.tables
                    WHERE table_schema = ?
                    ORDER BY table_type, table_name
                    """,
                    (schema,),
                )
                nodes: list[SchemaNode] = []
                for row in cur.fetchall():
                    table = row[0]
                    ttype = row[1]
                    node_type = "view" if "VIEW" in str(ttype).upper() else "table"
                    nodes.append(
                        SchemaNode(
                            id=f"table:{schema}.{table}",
                            label=table,
                            node_type=node_type,
                            path=["schemas", schema, table],
                            has_children=True,
                            icon=node_type,
                            metadata={"table_type": ttype},
                        )
                    )
                cur.execute(
                    """
                    SELECT routine_name, routine_type, data_type
                    FROM information_schema.routines
                    WHERE routine_schema = ?
                    ORDER BY routine_type, routine_name
                    """,
                    (schema,),
                )
                for row in cur.fetchall():
                    routine = row[0]
                    routine_type = row[1]
                    node_type = (
                        "procedure"
                        if routine_type == "PROCEDURE"
                        else "function"
                    )
                    nodes.append(
                        SchemaNode(
                            id=f"{node_type}:{schema}.{routine}",
                            label=routine,
                            node_type=node_type,
                            path=["schemas", schema, routine],
                            has_children=False,
                            icon=node_type,
                            metadata={
                                "routine_type": routine_type,
                                "return_type": row[2],
                            },
                        )
                    )
                return nodes
        if len(path) == 3 and path[0] == "schemas":
            schema, table = path[1], path[2]
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT c.column_name, c.data_type, c.is_nullable,
                           CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk
                    FROM information_schema.columns c
                    LEFT JOIN (
                        SELECT ku.table_schema, ku.table_name, ku.column_name
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage ku
                          ON tc.constraint_name = ku.constraint_name
                         AND tc.table_schema = ku.table_schema
                        WHERE tc.constraint_type = 'PRIMARY KEY'
                    ) pk
                      ON pk.table_schema = c.table_schema
                     AND pk.table_name = c.table_name
                     AND pk.column_name = c.column_name
                    WHERE c.table_schema = ? AND c.table_name = ?
                    ORDER BY c.ordinal_position
                    """,
                    (schema, table),
                )
                return [
                    SchemaNode(
                        id=f"col:{schema}.{table}.{row[0]}",
                        label=f"{row[0]}: {row[1]}",
                        node_type="column",
                        path=["schemas", schema, table, row[0]],
                        has_children=False,
                        icon="column",
                        metadata={
                            "nullable": row[2] == "YES",
                            "is_primary_key": bool(row[3]),
                        },
                    )
                    for row in cur.fetchall()
                ]
        return []

    def get_table_ddl(self, path: list[str]) -> str:
        if self._conn is None:
            raise RuntimeError("Not connected")
        if len(path) < 3 or path[0] != "schemas":
            return ""
        schema, table = path[1], path[2]
        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = ? AND table_name = ?
                ORDER BY ordinal_position
                """,
                (schema, table),
            )
            cols = cur.fetchall()
        if not cols:
            return f"-- Table [{schema}].[{table}] not found"
        lines = [f"CREATE TABLE [{schema}].[{table}] ("]
        for col in cols:
            null_sql = "" if col[2] == "YES" else " NOT NULL"
            default = f" DEFAULT {col[3]}" if col[3] else ""
            lines.append(f"  [{col[0]}] {col[1]}{null_sql}{default},")
        lines[-1] = lines[-1].rstrip(",")
        lines.append(");")
        return "\n".join(lines)

    def get_object_description(self, path: list[str]) -> ObjectDescription:
        if self._conn is None:
            raise RuntimeError("Not connected")
        if len(path) < 3 or path[0] != "schemas":
            return ObjectDescription(
                object_type="unknown",
                qualified_name=".".join(path),
            )

        schema, name = path[1], path[2]

        if len(path) == 4:
            return self._describe_column(schema, name, path[3])

        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name, table_type
                FROM information_schema.tables
                WHERE table_schema = ? AND table_name = ?
                """,
                (schema, name),
            )
            table_row = cur.fetchone()
            if table_row:
                object_type = (
                    "view" if "VIEW" in str(table_row[1]).upper() else "table"
                )
                return self._describe_table(schema, name, object_type)

            cur.execute(
                """
                SELECT routine_name, routine_type, data_type, external_language,
                       routine_definition
                FROM information_schema.routines
                WHERE routine_schema = ? AND routine_name = ?
                """,
                (schema, name),
            )
            routine_row = cur.fetchone()
            if routine_row:
                return self._describe_routine(schema, name, routine_row)

        return ObjectDescription(
            object_type="unknown",
            qualified_name=f"{schema}.{name}",
        )

    def _describe_column(
        self, schema: str, table: str, column: str
    ) -> ObjectDescription:
        assert self._conn is not None
        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type, is_nullable, column_default,
                       character_maximum_length, numeric_precision, numeric_scale
                FROM information_schema.columns
                WHERE table_schema = ? AND table_name = ? AND column_name = ?
                """,
                (schema, table, column),
            )
            row = cur.fetchone()
        if not row:
            return ObjectDescription(
                object_type="column",
                qualified_name=f"{schema}.{table}.{column}",
            )
        return ObjectDescription(
            object_type="column",
            qualified_name=f"{schema}.{table}.{column}",
            columns=[
                ColumnInfo(
                    name=row[0],
                    data_type=row[1],
                    nullable=row[2] == "YES",
                    default=row[3],
                )
            ],
            sections=[
                ObjectDescriptionSection(
                    title="Properties",
                    rows=[
                        {"Property": "Schema", "Value": schema},
                        {"Property": "Table", "Value": table},
                        {"Property": "Column", "Value": column},
                        {"Property": "Type", "Value": row[1]},
                        {
                            "Property": "Nullable",
                            "Value": "YES" if row[2] == "YES" else "NO",
                        },
                        {"Property": "Default", "Value": row[3] or ""},
                        {
                            "Property": "Max length",
                            "Value": row[4] or "",
                        },
                        {
                            "Property": "Precision",
                            "Value": row[5] or "",
                        },
                        {"Property": "Scale", "Value": row[6] or ""},
                    ],
                )
            ],
        )

    def _describe_table(
        self, schema: str, table: str, object_type: str
    ) -> ObjectDescription:
        assert self._conn is not None
        ddl = self.get_table_ddl(["schemas", schema, table])
        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                       CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT ku.table_schema, ku.table_name, ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku
                      ON tc.constraint_name = ku.constraint_name
                     AND tc.table_schema = ku.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                ) pk
                  ON pk.table_schema = c.table_schema
                 AND pk.table_name = c.table_name
                 AND pk.column_name = c.column_name
                WHERE c.table_schema = ? AND c.table_name = ?
                ORDER BY c.ordinal_position
                """,
                (schema, table),
            )
            columns = [
                ColumnInfo(
                    name=row[0],
                    data_type=row[1],
                    nullable=row[2] == "YES",
                    is_primary_key=bool(row[4]),
                    default=row[3],
                )
                for row in cur.fetchall()
            ]
            cur.execute(
                """
                SELECT i.name, i.type_desc
                FROM sys.indexes i
                JOIN sys.tables t ON i.object_id = t.object_id
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name = ? AND t.name = ? AND i.name IS NOT NULL
                ORDER BY i.name
                """,
                (schema, table),
            )
            indexes = cur.fetchall()
        sections: list[ObjectDescriptionSection] = [
            ObjectDescriptionSection(
                title="General",
                rows=[
                    {"Property": "Schema", "Value": schema},
                    {"Property": "Name", "Value": table},
                    {"Property": "Type", "Value": object_type},
                ],
            )
        ]
        if indexes:
            sections.append(
                ObjectDescriptionSection(
                    title="Indexes",
                    rows=[
                        {"Index": row[0], "Type": row[1]} for row in indexes
                    ],
                )
            )
        return ObjectDescription(
            object_type=object_type,
            qualified_name=f"{schema}.{table}",
            ddl=ddl,
            columns=columns,
            sections=sections,
        )

    def _describe_routine(
        self, schema: str, name: str, row: tuple[Any, ...]
    ) -> ObjectDescription:
        assert self._conn is not None
        routine_type = row[1]
        object_type = "procedure" if routine_type == "PROCEDURE" else "function"
        ddl = ""
        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT m.definition
                FROM sys.sql_modules m
                JOIN sys.objects o ON m.object_id = o.object_id
                JOIN sys.schemas s ON o.schema_id = s.schema_id
                WHERE s.name = ? AND o.name = ?
                """,
                (schema, name),
            )
            def_row = cur.fetchone()
            if def_row and def_row[0]:
                ddl = str(def_row[0])
            cur.execute(
                """
                SELECT parameter_name, data_type, parameter_mode
                FROM information_schema.parameters
                WHERE specific_schema = ? AND specific_name LIKE ?
                ORDER BY ordinal_position
                """,
                (schema, f"{name}%"),
            )
            params = cur.fetchall()
        param_rows = [
            {
                "Parameter": p[0] or "",
                "Type": p[1] or "",
                "Mode": p[2] or "",
            }
            for p in params
        ]
        sections: list[ObjectDescriptionSection] = [
            ObjectDescriptionSection(
                title="General",
                rows=[
                    {"Property": "Schema", "Value": schema},
                    {"Property": "Name", "Value": name},
                    {"Property": "Type", "Value": routine_type},
                    {"Property": "Language", "Value": row[3] or ""},
                    {"Property": "Return type", "Value": row[2] or ""},
                ],
            )
        ]
        if param_rows:
            sections.append(
                ObjectDescriptionSection(title="Parameters", rows=param_rows)
            )
        return ObjectDescription(
            object_type=object_type,
            qualified_name=f"{schema}.{name}",
            ddl=ddl or row[4],
            sections=sections,
        )


def _connection_string(config: ConnectionConfig, driver_name: str) -> str:
    encrypt = "yes" if config.ssl else "no"
    trust = "yes" if not config.ssl else "no"
    intent = "ReadOnly" if config.read_only else "ReadWrite"
    return (
        f"DRIVER={{{driver_name}}};"
        f"SERVER={config.host},{config.port};"
        f"DATABASE={config.database};"
        f"UID={config.username};"
        f"PWD={config.password};"
        f"Encrypt={encrypt};"
        f"TrustServerCertificate={trust};"
        f"ApplicationIntent={intent};"
    )
