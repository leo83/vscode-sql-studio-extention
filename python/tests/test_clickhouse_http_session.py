"""Integration tests for ClickHouse HTTP session persistence."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from sql_studio.drivers.registry import _DRIVERS, _SESSION_DATABASES
from sql_studio.server import JsonRpcServer


def _clickhouse_connection() -> dict:
    return {
        "id": "ch-http",
        "dialect": "clickhouse",
        "host": "localhost",
        "port": 8123,
        "database": "default",
        "username": "default",
        "password": "",
        "clickhouse_interface": "http",
    }


def setup_function() -> None:
    for driver in list(_DRIVERS.values()):
        driver.disconnect()
    _DRIVERS.clear()
    _SESSION_DATABASES.clear()


def test_use_then_select_reuses_session_database() -> None:
    query_databases: list[str | None] = []

    def make_client(**kwargs: object) -> MagicMock:
        client = MagicMock()
        client.database = kwargs.get("database", "default")
        client.close = MagicMock()

        def query(sql: str) -> MagicMock:
            query_databases.append(client.database)
            if client.database != "robotisation":
                raise RuntimeError(
                    "Unknown table expression identifier 'messages' in scope "
                    + sql
                )
            result = MagicMock()
            result.column_names = ["id"]
            result.column_types = []
            result.result_rows = [[1]]
            result.summary = None
            return result

        def command(cmd: str, use_database: bool = True, **_kw: object) -> MagicMock:
            if cmd.strip().upper().startswith("USE"):
                database = cmd.split()[-1].strip("`")
                client.database = database
            return MagicMock(summary="ok")

        client.query = query
        client.command = command
        return client

    server = JsonRpcServer()
    with patch(
        "sql_studio.drivers.clickhouse_http.clickhouse_connect.get_client",
        side_effect=make_client,
    ):
        use_response = server._handle(
            {
                "id": 1,
                "method": "query/execute",
                "params": {
                    "connection": _clickhouse_connection(),
                    "sql": "use robotisation;",
                },
            }
        )
        select_response = server._handle(
            {
                "id": 2,
                "method": "query/execute",
                "params": {
                    "connection": _clickhouse_connection(),
                    "sql": "select * from messages;",
                },
            }
        )

    assert "error" not in use_response
    assert "error" not in select_response
    assert query_databases == ["robotisation"]
