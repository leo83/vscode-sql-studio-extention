"""MySQL driver via PyMySQL."""

from __future__ import annotations

import time
from typing import Any

import pymysql
from pymysql.cursors import DictCursor

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

_SYSTEM_SCHEMAS = ("information_schema", "mysql", "performance_schema", "sys")


class MySQLDriver:
    def __init__(self) -> None:
        self._conn: pymysql.Connection | None = None
        self._config: ConnectionConfig | None = None

    def connect(self, config: ConnectionConfig) -> None:
        self.disconnect()
        kwargs: dict[str, Any] = {
            "host": config.host,
            "port": config.port,
            "user": config.username,
            "password": config.password,
            "database": config.database,
            "connect_timeout": 10,
            "autocommit": True,
            "cursorclass": DictCursor,
        }
        if config.ssl:
            kwargs["ssl"] = {"ssl": {}}
        self._conn = pymysql.connect(**kwargs)
        self._config = config

    def disconnect(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None
        self._config = None

    def cancel_query(self) -> None:
        return None

    def is_connected_with(self, config: ConnectionConfig) -> bool:
        return self._config == config and self._conn is not None and self._conn.open

    def set_active_database(self, database: str) -> None:
        if self._conn is None:
            return
        escaped = database.replace("`", "``")
        with self._conn.cursor() as cur:
            cur.execute(f"USE `{escaped}`")
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
                SELECT TABLE_ROWS AS row_estimate
                FROM information_schema.tables
                WHERE table_schema = %s AND table_name = %s
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
                    WHERE schema_name NOT IN (%s, %s, %s, %s)
                    ORDER BY schema_name
                    """,
                    _SYSTEM_SCHEMAS,
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
                    table = row["table_name"]
                    ttype = row["table_type"]
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
                    WHERE c.table_schema = %s AND c.table_name = %s
                    ORDER BY c.ordinal_position
                    """,
                    (schema, table),
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
            esc_schema = schema.replace("`", "``")
            esc_table = table.replace("`", "``")
            cur.execute(f"SHOW CREATE TABLE `{esc_schema}`.`{esc_table}`")
            row = cur.fetchone()
        if not row:
            return f"-- Table `{schema}`.`{table}` not found"
        create_sql = row.get("Create Table") or row.get("Create View") or ""
        return str(create_sql)

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
                    "view" if "VIEW" in str(table_row["table_type"]).upper() else "table"
                )
                ddl = self.get_table_ddl(["schemas", schema, name])
                cur.execute(
                    """
                    SELECT column_name, data_type, is_nullable, column_default,
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
                    WHERE c.table_schema = %s AND c.table_name = %s
                    ORDER BY c.ordinal_position
                    """,
                    (schema, name),
                )
                columns = [
                    ColumnInfo(
                        name=row["column_name"],
                        data_type=row["data_type"],
                        nullable=row["is_nullable"] == "YES",
                        is_primary_key=bool(row["is_pk"]),
                        default=row["column_default"],
                    )
                    for row in cur.fetchall()
                ]
                return ObjectDescription(
                    object_type=object_type,
                    qualified_name=f"{schema}.{name}",
                    ddl=ddl,
                    columns=columns,
                    sections=[
                        ObjectDescriptionSection(
                            title="General",
                            rows=[
                                {"Property": "Schema", "Value": schema},
                                {"Property": "Name", "Value": name},
                                {"Property": "Type", "Value": object_type},
                            ],
                        )
                    ],
                )

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
                object_type = (
                    "procedure"
                    if routine_row["routine_type"] == "PROCEDURE"
                    else "function"
                )
                return ObjectDescription(
                    object_type=object_type,
                    qualified_name=f"{schema}.{name}",
                    ddl=routine_row.get("routine_definition"),
                    sections=[
                        ObjectDescriptionSection(
                            title="General",
                            rows=[
                                {"Property": "Schema", "Value": schema},
                                {"Property": "Name", "Value": name},
                                {"Property": "Type", "Value": routine_row["routine_type"]},
                                {
                                    "Property": "Language",
                                    "Value": routine_row.get("external_language") or "",
                                },
                                {
                                    "Property": "Return type",
                                    "Value": routine_row.get("data_type") or "",
                                },
                            ],
                        )
                    ],
                )

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
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s AND column_name = %s
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
                    name=row["column_name"],
                    data_type=row["data_type"],
                    nullable=row["is_nullable"] == "YES",
                    default=row["column_default"],
                )
            ],
        )
