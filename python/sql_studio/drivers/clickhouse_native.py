"""ClickHouse native TCP driver (port 9000/9440) via clickhouse-driver."""

from __future__ import annotations

import time
from typing import Any

from clickhouse_driver import Client as NativeClient

from sql_studio.dialect import sqlglot_service
from sql_studio.drivers.clickhouse_query import build_query_result
from sql_studio.drivers.clickhouse_session import apply_use_database, set_client_database
from sql_studio.execution_status import clickhouse_status, is_result_set_query
from sql_studio.drivers.clickhouse_object import get_clickhouse_object_description
from sql_studio.models import ConnectionConfig, ObjectDescription, QueryResult, SchemaNode


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

    def cancel_query(self) -> None:
        if self._client is not None:
            try:
                self._client.disconnect()
            except Exception:
                pass
            self._client = None

    def is_connected_with(self, config: ConnectionConfig) -> bool:
        return self._config == config and self._client is not None

    def set_active_database(self, database: str) -> None:
        if self._client is None:
            return
        set_client_database(self._client, database)

    def test_connection(self) -> None:
        if self._client is None:
            raise RuntimeError("Not connected")
        self._client.execute("SELECT 1")

    def execute(self, sql: str, limit: int | None = 10_000) -> QueryResult:
        if self._client is None:
            raise RuntimeError("Not connected")
        started = time.perf_counter()
        if sqlglot_service.is_session_statement(sql) or not is_result_set_query(sql):
            self._client.execute(sql)
            apply_use_database(self._client, sql)
            duration_ms = (time.perf_counter() - started) * 1000
            return QueryResult(
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=duration_ms,
                status_message=clickhouse_status(sql, None),
            )
        effective_limit = limit if limit is not None else 10_000
        result = self._client.execute(sql, with_column_types=True)
        duration_ms = (time.perf_counter() - started) * 1000
        if not isinstance(result, tuple) or len(result) != 2:
            return QueryResult(
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=duration_ms,
                status_message=clickhouse_status(sql, None),
            )
        rows_raw, col_types = result
        column_names = [str(col[0]) for col in col_types] if col_types else None
        column_types = [col[1] for col in col_types] if col_types else None
        return build_query_result(
            sql=sql,
            column_names=column_names,
            column_types=column_types,
            rows=list(rows_raw or []),
            duration_ms=duration_ms,
            limit=effective_limit,
            status_for_empty=lambda query: clickhouse_status(query, None),
        )

    def estimate_table_row_count(self, schema: str, table: str) -> int | None:
        if self._client is None:
            raise RuntimeError("Not connected")
        rows = self._client.execute(
            """
            SELECT total_rows
            FROM system.tables
            WHERE database = %(db)s AND name = %(tbl)s
            """,
            {"db": schema, "tbl": table},
        )
        if not rows or rows[0][0] is None:
            return None
        return int(rows[0][0])

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
                    node_type=(
                        "view"
                        if len(row) > 1 and "View" in str(row[1])
                        else "table"
                    ),
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

    def get_object_description(self, path: list[str]) -> ObjectDescription:
        if self._client is None:
            raise RuntimeError("Not connected")
        return get_clickhouse_object_description(
            _NativeQueryAdapter(self._client),
            path,
            execute=lambda sql: self._client.execute(sql),
        )


class _NativeQueryAdapter:
    def __init__(self, client: Any) -> None:
        self._client = client

    def query(self, sql: str, parameters: dict[str, Any] | None = None) -> Any:
        if parameters:
            for key, value in parameters.items():
                escaped = str(value).replace("'", "\\'")
                sql = sql.replace(f"{{{key}:String}}", f"'{escaped}'")
        rows = self._client.execute(sql)
        return type("Result", (), {"result_rows": rows})()

    def command(self, sql: str) -> Any:
        rows = self._client.execute(sql)
        if rows and rows[0]:
            return rows[0][0]
        return None
