"""ClickHouse HTTP driver (port 8123/8443) via clickhouse-connect."""

from __future__ import annotations

import time
from typing import Any

import clickhouse_connect
from clickhouse_connect.driver.client import Client

from sql_studio.dialect import sqlglot_service
from sql_studio.drivers.clickhouse_query import build_query_result
from sql_studio.execution_status import clickhouse_status, is_result_set_query
from sql_studio.models import ConnectionConfig, QueryResult, SchemaNode


class ClickHouseHttpDriver:
    def __init__(self) -> None:
        self._client: Client | None = None
        self._config: ConnectionConfig | None = None

    def connect(self, config: ConnectionConfig) -> None:
        self.disconnect()
        self._client = clickhouse_connect.get_client(
            host=config.host,
            port=config.port,
            username=config.username,
            password=config.password,
            database=config.database,
            secure=config.ssl,
            connect_timeout=10,
            send_receive_timeout=15,
            settings={"readonly": 1 if config.read_only else 0},
        )
        self._config = config

    def disconnect(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
        self._config = None

    def is_connected_with(self, config: ConnectionConfig) -> bool:
        return self._config == config and self._client is not None

    def test_connection(self) -> None:
        if self._client is None:
            raise RuntimeError("Not connected")
        self._client.command("SELECT 1")

    def execute(self, sql: str, limit: int | None = 10_000) -> QueryResult:
        if self._client is None:
            raise RuntimeError("Not connected")
        started = time.perf_counter()
        if sqlglot_service.is_session_statement(sql) or not is_result_set_query(sql):
            response = self._client.command(sql)
            duration_ms = (time.perf_counter() - started) * 1000
            summary = getattr(response, "summary", None) or response
            return QueryResult(
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=duration_ms,
                status_message=clickhouse_status(sql, summary),
            )
        effective_limit = limit if limit is not None else 10_000
        result = self._client.query(sql)
        duration_ms = (time.perf_counter() - started) * 1000
        summary = getattr(result, "summary", None)

        def status_for_empty(query: str) -> str:
            return clickhouse_status(query, summary)

        return build_query_result(
            sql=sql,
            column_names=list(result.column_names or []),
            column_types=list(result.column_types or []) if result.column_types else None,
            rows=list(result.result_rows or []),
            duration_ms=duration_ms,
            limit=effective_limit,
            status_for_empty=status_for_empty,
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
            rows = self._client.query("SHOW DATABASES").result_rows or []
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
            rows = self._client.query(
                "SELECT name, engine FROM system.tables WHERE database = {db:String}",
                parameters={"db": database},
            ).result_rows or []
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
            rows = self._client.query(
                """
                SELECT name, type, default_kind
                FROM system.columns
                WHERE database = {db:String} AND table = {tbl:String}
                ORDER BY position
                """,
                parameters={"db": database, "tbl": table},
            ).result_rows or []
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
        ddl = self._client.command(f"SHOW CREATE TABLE `{database}`.`{table}`")
        return str(ddl) if ddl else f"-- Table {database}.{table} not found"
