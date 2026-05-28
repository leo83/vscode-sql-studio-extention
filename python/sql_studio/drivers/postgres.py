"""PostgreSQL driver via psycopg3."""

from __future__ import annotations

import time
from typing import Any

import psycopg
from psycopg.rows import dict_row

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


class PostgresDriver:
    def __init__(self) -> None:
        self._conn: psycopg.Connection[Any] | None = None
        self._config: ConnectionConfig | None = None

    def connect(self, config: ConnectionConfig) -> None:
        self.disconnect()
        sslmode = "require" if config.ssl else "prefer"
        self._conn = psycopg.connect(
            host=config.host,
            port=config.port,
            dbname=config.database,
            user=config.username,
            password=config.password,
            connect_timeout=10,
            row_factory=dict_row,
            autocommit=True,
            options=f"-c default_transaction_read_only={'on' if config.read_only else 'off'}",
            sslmode=sslmode,
        )
        self._config = config

    def disconnect(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None
        self._config = None

    def cancel_query(self) -> None:
        if self._conn is not None and not self._conn.closed:
            self._conn.cancel()

    def is_connected_with(self, config: ConnectionConfig) -> bool:
        return (
            self._config == config
            and self._conn is not None
            and not self._conn.closed
        )

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
                row_count = cur.rowcount if cur.rowcount >= 0 else 0
                return QueryResult(
                    columns=[],
                    rows=[],
                    row_count=row_count,
                    duration_ms=duration_ms,
                    status_message=postgres_status(sql, cur.statusmessage, cur.rowcount),
                )
            columns = [
                QueryColumn(name=desc.name, data_type=str(desc.type_code))
                for desc in cur.description
            ]
            effective_limit = limit if limit is not None else 10_000
            rows_raw = cur.fetchmany(effective_limit + 1)
            truncated = len(rows_raw) > effective_limit
            if truncated:
                rows_raw = rows_raw[:effective_limit]
            rows = [[row.get(col.name) for col in columns] for row in rows_raw]
            duration_ms = (time.perf_counter() - started) * 1000
            return QueryResult(
                columns=columns,
                rows=rows,
                row_count=len(rows),
                duration_ms=duration_ms,
                truncated=truncated,
            )

    def estimate_table_row_count(self, schema: str, table: str) -> int | None:
        if self._conn is None:
            raise RuntimeError("Not connected")
        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.reltuples::bigint AS row_estimate
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = %s AND c.relname = %s
                """,
                (schema, table),
            )
            row = cur.fetchone() or {}
            estimate = row.get("row_estimate")
            if estimate is None:
                return None
            return int(estimate)

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
                    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                      AND schema_name NOT LIKE 'pg_%'
                    ORDER BY schema_name
                    """
                )
                return [
                    SchemaNode(
                        id=f"schema:{row['schema_name']}",
                        label=row["schema_name"],
                        node_type="schema",
                        path=["schemas", row["schema_name"]],
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
                    WHERE table_schema = %s
                    ORDER BY table_type, table_name
                    """,
                    (schema,),
                )
                nodes: list[SchemaNode] = []
                for row in cur.fetchall():
                    ttype = row["table_type"]
                    node_type = "view" if "VIEW" in ttype else "table"
                    table = row["table_name"]
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
                    WHERE routine_schema = %s
                    ORDER BY routine_type, routine_name
                    """,
                    (schema,),
                )
                for row in cur.fetchall():
                    routine = row["routine_name"]
                    routine_type = row["routine_type"]
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
                                "return_type": row["data_type"],
                            },
                        )
                    )
                return nodes
        if len(path) == 3 and path[0] == "schemas":
            schema, table = path[1], path[2]
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT column_name, data_type, is_nullable,
                           COALESCE(
                               (SELECT true FROM information_schema.table_constraints tc
                                JOIN information_schema.key_column_usage kcu
                                  ON tc.constraint_name = kcu.constraint_name
                                 AND tc.table_schema = kcu.table_schema
                                WHERE tc.constraint_type = 'PRIMARY KEY'
                                  AND tc.table_schema = %s AND tc.table_name = %s
                                  AND kcu.column_name = c.column_name
                                LIMIT 1), false
                           ) AS is_pk
                    FROM information_schema.columns c
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (schema, table, schema, table),
                )
                return [
                    SchemaNode(
                        id=f"col:{schema}.{table}.{row['column_name']}",
                        label=f"{row['column_name']}: {row['data_type']}",
                        node_type="column",
                        path=["schemas", schema, table, row["column_name"]],
                        has_children=False,
                        icon="column",
                        metadata={
                            "nullable": row["is_nullable"] == "YES",
                            "is_primary_key": bool(row["is_pk"]),
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
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
                """,
                (schema, table),
            )
            cols = cur.fetchall()
        if not cols:
            return f"-- Table {schema}.{table} not found"
        lines = [f"CREATE TABLE {schema}.{table} ("]
        for col in cols:
            null_sql = "" if col["is_nullable"] == "YES" else " NOT NULL"
            default = (
                f" DEFAULT {col['column_default']}" if col["column_default"] else ""
            )
            lines.append(
                f"  {col['column_name']} {col['data_type']}{null_sql}{default},"
            )
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
                WHERE table_schema = %s AND table_name = %s
                """,
                (schema, name),
            )
            table_row = cur.fetchone()
            if table_row:
                object_type = (
                    "view" if "VIEW" in table_row["table_type"] else "table"
                )
                return self._describe_table(schema, name, object_type)

            cur.execute(
                """
                SELECT routine_name, routine_type, data_type, external_language,
                       routine_definition
                FROM information_schema.routines
                WHERE routine_schema = %s AND routine_name = %s
                LIMIT 1
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
                       character_maximum_length, numeric_precision, numeric_scale,
                       col_description(
                           (quote_ident(%s) || '.' || quote_ident(%s))::regclass::oid,
                           ordinal_position
                       ) AS comment
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s AND column_name = %s
                """,
                (schema, table, schema, table, column),
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
                    name=row["column_name"],
                    data_type=row["data_type"],
                    nullable=row["is_nullable"] == "YES",
                    default=row["column_default"],
                    comment=row["comment"],
                )
            ],
            sections=[
                ObjectDescriptionSection(
                    title="Properties",
                    rows=[
                        {"Property": "Schema", "Value": schema},
                        {"Property": "Table", "Value": table},
                        {"Property": "Column", "Value": column},
                        {"Property": "Type", "Value": row["data_type"]},
                        {
                            "Property": "Nullable",
                            "Value": "YES" if row["is_nullable"] == "YES" else "NO",
                        },
                        {
                            "Property": "Default",
                            "Value": row["column_default"] or "",
                        },
                        {
                            "Property": "Max length",
                            "Value": row["character_maximum_length"] or "",
                        },
                        {
                            "Property": "Precision",
                            "Value": row["numeric_precision"] or "",
                        },
                        {"Property": "Scale", "Value": row["numeric_scale"] or ""},
                        {"Property": "Comment", "Value": row["comment"] or ""},
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
                SELECT column_name, data_type, is_nullable, column_default,
                       COALESCE(
                           (SELECT true FROM information_schema.table_constraints tc
                            JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                             AND tc.table_schema = kcu.table_schema
                            WHERE tc.constraint_type = 'PRIMARY KEY'
                              AND tc.table_schema = %s AND tc.table_name = %s
                              AND kcu.column_name = c.column_name
                            LIMIT 1), false
                       ) AS is_pk,
                       col_description(
                           (quote_ident(%s) || '.' || quote_ident(%s))::regclass::oid,
                           ordinal_position
                       ) AS comment
                FROM information_schema.columns c
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
                """,
                (schema, table, schema, table, schema, table),
            )
            columns = [
                ColumnInfo(
                    name=row["column_name"],
                    data_type=row["data_type"],
                    nullable=row["is_nullable"] == "YES",
                    is_primary_key=bool(row["is_pk"]),
                    default=row["column_default"],
                    comment=row["comment"],
                )
                for row in cur.fetchall()
            ]
            cur.execute(
                """
                SELECT obj_description(
                    (quote_ident(%s) || '.' || quote_ident(%s))::regclass::oid,
                    'pg_class'
                ) AS comment
                """,
                (schema, table),
            )
            table_comment = (cur.fetchone() or {}).get("comment")
            cur.execute(
                """
                SELECT c.reltuples::bigint AS row_estimate,
                       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = %s AND c.relname = %s
                """,
                (schema, table),
            )
            stats = cur.fetchone() or {}
            cur.execute(
                """
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = %s AND tablename = %s
                ORDER BY indexname
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
                    {
                        "Property": "Estimated rows",
                        "Value": stats.get("row_estimate", ""),
                    },
                    {"Property": "Total size", "Value": stats.get("total_size", "")},
                    {"Property": "Comment", "Value": table_comment or ""},
                ],
            )
        ]
        if indexes:
            sections.append(
                ObjectDescriptionSection(
                    title="Indexes",
                    rows=[
                        {"Index": row["indexname"], "Definition": row["indexdef"]}
                        for row in indexes
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
        self, schema: str, name: str, row: dict[str, Any]
    ) -> ObjectDescription:
        assert self._conn is not None
        routine_type = row["routine_type"]
        object_type = "procedure" if routine_type == "PROCEDURE" else "function"
        ddl = ""
        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT pg_get_functiondef(p.oid) AS definition
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = %s AND p.proname = %s
                LIMIT 1
                """,
                (schema, name),
            )
            def_row = cur.fetchone()
            if def_row and def_row.get("definition"):
                ddl = str(def_row["definition"])
            cur.execute(
                """
                SELECT parameter_name, data_type, parameter_mode
                FROM information_schema.parameters
                WHERE specific_schema = %s AND specific_name LIKE %s
                ORDER BY ordinal_position
                """,
                (schema, f"{name}%"),
            )
            params = cur.fetchall()
        param_rows = [
            {
                "Parameter": p["parameter_name"] or "",
                "Type": p["data_type"] or "",
                "Mode": p["parameter_mode"] or "",
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
                    {"Property": "Language", "Value": row["external_language"] or ""},
                    {
                        "Property": "Return type",
                        "Value": row["data_type"] or "",
                    },
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
            ddl=ddl or row.get("routine_definition"),
            sections=sections,
        )
