"""ClickHouse native TCP driver (port 9000/9440) via clickhouse-driver."""

from __future__ import annotations

import time
from typing import Any

from clickhouse_driver import Client as NativeClient

from sql_studio.models import ConnectionConfig, QueryColumn, QueryResult, SchemaNode


class ClickHouseNativeDriver:
    def __init__(self) -> None:
        self._client: NativeClient | None = None
        self._config: ConnectionConfig | None = None

    def connect(self, config: ConnectionConfig) -> None:
        self.disconnect()
        settings: dict[str, Any] = {}
        if config.read_only:
            settings["readonly"] = 1
        self._client = NativeClient(
            host=config.host,
            port=config.port,
            user=config.username,
            password=config.password,
            database=config.database,
            secure=config.ssl,
            connect_timeout=10,
            send_receive_timeout=15,
            settings=settings,
        )
        self._config = config

    def disconnect(self) -> None:
        if self._client is not None:
            self._client.disconnect()
            self._client = None
        self._config = None

    def test_connection(self) -> None:
        if self._client is None:
            raise RuntimeError("Not connected")
        self._client.execute("SELECT 1")

    def execute(self, sql: str, limit: int | None = 10_000) -> QueryResult:
        if self._client is None:
            raise RuntimeError("Not connected")
        started = time.perf_counter()
        effective_limit = limit if limit is not None else 10_000
        result = self._client.execute(sql, with_column_types=True)
        duration_ms = (time.perf_counter() - started) * 1000
        if not isinstance(result, tuple) or len(result) != 2:
            return QueryResult(
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=duration_ms,
            )
        rows_raw, col_types = result
        if not col_types:
            return QueryResult(
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=duration_ms,
            )
        columns = [
            QueryColumn(name=str(col[0]), data_type=str(col[1])) for col in col_types
        ]
        all_rows = list(rows_raw or [])
        truncated = len(all_rows) > effective_limit
        if truncated:
            all_rows = all_rows[:effective_limit]
        rows = [list(row) for row in all_rows]
        return QueryResult(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            duration_ms=duration_ms,
            truncated=truncated,
        )

    def list_schema_children(self, path: list[str]) -> list[SchemaNode]:
        if self._client is None:
            raise RuntimeError("Not connected")
        if not path:
            return [
                SchemaNode(
                    id="databases",
                    label="Databases",
                    node_type="folder",
                    path=["databases"],
                    has_children=True,
                    icon="folder",
                )
            ]
        if path == ["databases"]:
            rows = self._client.execute("SHOW DATABASES")
            return [
                SchemaNode(
                    id=f"db:{row[0]}",
                    label=str(row[0]),
                    node_type="database",
                    path=["databases", str(row[0])],
                    has_children=True,
                    icon="database",
                )
                for row in rows
                if str(row[0]) not in ("system", "INFORMATION_SCHEMA")
            ]
        if len(path) == 2 and path[0] == "databases":
            database = path[1]
            rows = self._client.execute(
                "SELECT name, engine FROM system.tables WHERE database = %(db)s",
                {"db": database},
            )
            return [
                SchemaNode(
                    id=f"table:{database}.{row[0]}",
                    label=str(row[0]),
                    node_type="table",
                    path=["databases", database, str(row[0])],
                    has_children=True,
                    icon="table",
                    metadata={"engine": str(row[1]) if len(row) > 1 else ""},
                )
                for row in rows
            ]
        if len(path) == 3 and path[0] == "databases":
            database, table = path[1], path[2]
            rows = self._client.execute(
                """
                SELECT name, type, default_kind
                FROM system.columns
                WHERE database = %(db)s AND table = %(tbl)s
                ORDER BY position
                """,
                {"db": database, "tbl": table},
            )
            return [
                SchemaNode(
                    id=f"col:{database}.{table}.{row[0]}",
                    label=f"{row[0]}: {row[1]}",
                    node_type="column",
                    path=["databases", database, table, str(row[0])],
                    has_children=False,
                    icon="column",
                    metadata={"default_kind": str(row[2]) if len(row) > 2 else ""},
                )
                for row in rows
            ]
        return []

    def get_table_ddl(self, path: list[str]) -> str:
        if self._client is None:
            raise RuntimeError("Not connected")
        if len(path) < 3 or path[0] != "databases":
            return ""
        database, table = path[1], path[2]
        rows = self._client.execute(f"SHOW CREATE TABLE `{database}`.`{table}`")
        if rows and rows[0]:
            return str(rows[0][0])
        return f"-- Table {database}.{table} not found"
