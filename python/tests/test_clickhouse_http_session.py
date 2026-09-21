"""Integration tests for ClickHouse HTTP session persistence."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from sql_studio.drivers.registry import _DRIVERS, _SESSION_DATABASES
from sql_studio.server import JsonRpcServer


class _FakeStream:
    """Stand-in for clickhouse-connect's StreamContext of row blocks."""

    def __init__(self, column_names: list[str], blocks: list[list[list[object]]]):
        self.source = MagicMock()
        self.source.column_names = column_names
        self.source.column_types = []
        self.source.summary = None
        self._blocks = blocks

    def __enter__(self) -> "_FakeStream":
        return self

    def __exit__(self, *_exc: object) -> None:
        return None

    def __iter__(self):
        return iter(self._blocks)


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

        def query_row_block_stream(sql: str) -> _FakeStream:
            query_databases.append(client.database)
            if client.database != "app_db":
                raise RuntimeError(
                    "Unknown table expression identifier 'messages' in scope "
                    + sql
                )
            return _FakeStream(column_names=["id"], blocks=[[[1]]])

        def command(cmd: str, use_database: bool = True, **_kw: object) -> MagicMock:
            if cmd.strip().upper().startswith("USE"):
                database = cmd.split()[-1].strip("`")
                client.database = database
            return MagicMock(summary="ok")

        client.query_row_block_stream = query_row_block_stream
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
                    "sql": "use app_db;",
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
    assert query_databases == ["app_db"]
