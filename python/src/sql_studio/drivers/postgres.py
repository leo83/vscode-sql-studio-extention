"""PostgreSQL driver via psycopg3."""

from __future__ import annotations

import time
from typing import Any

import psycopg
from psycopg.rows import dict_row

from sql_studio.execution_status import postgres_status
from sql_studio.models import ConnectionConfig, QueryColumn, QueryResult, SchemaNode


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
