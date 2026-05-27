"""Tests for USE persistence across separate query executions."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from sql_studio.models import ConnectionConfig, QueryResult
from sql_studio.server import JsonRpcServer


def _clickhouse_connection() -> dict:
    return {
        "id": "ch-1",
        "dialect": "clickhouse",
        "host": "localhost",
        "port": 8123,
        "database": "default",
        "username": "default",
        "password": "",
        "clickhouse_interface": "http",
    }


@patch("sql_studio.server.get_driver")
def test_use_then_select_on_same_driver(mock_get_driver: MagicMock) -> None:
    mock_driver = MagicMock()
    mock_get_driver.return_value = mock_driver
    mock_driver.execute.side_effect = [
        QueryResult(
            columns=[],
            rows=[],
            row_count=0,
            duration_ms=1.0,
            status_message="Database changed to `robotisation`",
        ),
        QueryResult(
            columns=[],
            rows=[],
            row_count=1,
            duration_ms=2.0,
        ),
    ]

    server = JsonRpcServer()
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

    assert use_response["result"]["statements"][0]["status_message"]
    assert select_response["result"]["statements"][0]["sql"] == "SELECT * FROM messages"
    assert mock_get_driver.call_count == 2
    assert mock_driver.execute.call_args_list[1].args[0] == "SELECT * FROM messages"

    from sql_studio.drivers.registry import get_session_database

    assert get_session_database("ch-1") == "robotisation"
