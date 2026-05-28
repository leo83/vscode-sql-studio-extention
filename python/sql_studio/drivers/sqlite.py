"""SQLite driver via stdlib sqlite3."""

from __future__ import annotations

import sqlite3
import time
from typing import Any

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

_MAIN_SCHEMA = "main"


class SqliteDriver:
    def __init__(self) -> None:
        self._conn: sqlite3.Connection | None = None
        self._config: ConnectionConfig | None = None

    def connect(self, config: ConnectionConfig) -> None:
        self.disconnect()
        db_path = config.database.strip()
        if not db_path:
            raise ValueError("SQLite database file path is required")
        if config.read_only:
            uri = f"file:{db_path}?mode=ro"
            self._conn = sqlite3.connect(uri, uri=True, timeout=10)
        else:
            self._conn = sqlite3.connect(db_path, timeout=10)
        self._conn.row_factory = sqlite3.Row
        self._conn.isolation_level = None
        self._config = config

    def disconnect(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None
        self._config = None

    def cancel_query(self) -> None:
        return None

    def is_connected_with(self, config: ConnectionConfig) -> bool:
        return self._config == config and self._conn is not None

    def test_connection(self) -> None:
        if self._conn is None:
            raise RuntimeError("Not connected")
        self._conn.execute("SELECT 1")

    def execute(self, sql: str, limit: int | None = 10_000) -> QueryResult:
        if self._conn is None:
            raise RuntimeError("Not connected")
        started = time.perf_counter()
        cur = self._conn.cursor()
        try:
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
            rows = [[row[idx] for idx in range(len(columns))] for row in rows_raw]
            duration_ms = (time.perf_counter() - started) * 1000
            return QueryResult(
                columns=columns,
                rows=rows,
                row_count=len(rows),
                duration_ms=duration_ms,
                truncated=truncated,
            )
        finally:
            cur.close()

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
            return [
                SchemaNode(
                    id=f"schema:{_MAIN_SCHEMA}",
                    label=_MAIN_SCHEMA,
                    node_type="schema",
                    path=["schemas", _MAIN_SCHEMA],
                    has_children=True,
                    icon="database",
                )
            ]
        if len(path) == 2 and path[0] == "schemas":
            schema = path[1]
            cur = self._conn.execute(
                """
                SELECT name, type
                FROM sqlite_master
                WHERE type IN ('table', 'view')
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY type, name
                """
            )
            nodes: list[SchemaNode] = []
            for row in cur.fetchall():
                name = row["name"]
                node_type = "view" if row["type"] == "view" else "table"
                nodes.append(
                    SchemaNode(
                        id=f"table:{schema}.{name}",
                        label=name,
                        node_type=node_type,
                        path=["schemas", schema, name],
                        has_children=True,
                        icon=node_type,
                        metadata={"table_type": row["type"]},
                    )
                )
            return nodes
        if len(path) == 3 and path[0] == "schemas":
            schema, table = path[1], path[2]
            cur = self._conn.execute(f"PRAGMA table_info({self._quote_ident(table)})")
            return [
                SchemaNode(
                    id=f"col:{schema}.{table}.{row['name']}",
                    label=f"{row['name']}: {row['type']}",
                    node_type="column",
                    path=["schemas", schema, table, row["name"]],
                    has_children=False,
                    icon="column",
                    metadata={
                        "nullable": row["notnull"] == 0,
                        "is_primary_key": row["pk"] > 0,
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
        table = path[2]
        row = self._conn.execute(
            """
            SELECT sql
            FROM sqlite_master
            WHERE type IN ('table', 'view') AND name = ?
            """,
            (table,),
        ).fetchone()
        if not row or not row["sql"]:
            return f"-- Table {table} not found"
        return str(row["sql"])

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

        row = self._conn.execute(
            """
            SELECT name, type, sql
            FROM sqlite_master
            WHERE name = ? AND type IN ('table', 'view')
            """,
            (name,),
        ).fetchone()
        if not row:
            return ObjectDescription(
                object_type="unknown",
                qualified_name=f"{schema}.{name}",
            )
        object_type = "view" if row["type"] == "view" else "table"
        columns = [
            ColumnInfo(
                name=col["name"],
                data_type=col["type"] or "",
                nullable=col["notnull"] == 0,
                is_primary_key=col["pk"] > 0,
                default=col["dflt_value"],
            )
            for col in self._conn.execute(
                f"PRAGMA table_info({self._quote_ident(name)})"
            ).fetchall()
        ]
        return ObjectDescription(
            object_type=object_type,
            qualified_name=f"{schema}.{name}",
            ddl=row["sql"],
            columns=columns,
            sections=[
                ObjectDescriptionSection(
                    title="General",
                    rows=[
                        {"Property": "Schema", "Value": schema},
                        {"Property": "Name", "Value": name},
                        {"Property": "Type", "Value": object_type},
                        {"Property": "File", "Value": self._config.database if self._config else ""},
                    ],
                )
            ],
        )

    def _describe_column(
        self, schema: str, table: str, column: str
    ) -> ObjectDescription:
        assert self._conn is not None
        row = self._conn.execute(
            f"PRAGMA table_info({self._quote_ident(table)})"
        ).fetchall()
        match = next((r for r in row if r["name"] == column), None)
        if match is None:
            return ObjectDescription(
                object_type="column",
                qualified_name=f"{schema}.{table}.{column}",
            )
        return ObjectDescription(
            object_type="column",
            qualified_name=f"{schema}.{table}.{column}",
            columns=[
                ColumnInfo(
                    name=match["name"],
                    data_type=match["type"] or "",
                    nullable=match["notnull"] == 0,
                    is_primary_key=match["pk"] > 0,
                    default=match["dflt_value"],
                )
            ],
        )

    @staticmethod
    def _quote_ident(name: str) -> str:
        escaped = name.replace('"', '""')
        return f'"{escaped}"'
