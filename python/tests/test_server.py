"""Tests for JSON-RPC server handlers."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from sql_studio.models import (
    ConnectionConfig,
    QueryColumn,
    QueryResult,
    SchemaDbmlResult,
    SchemaNode,
)
from sql_studio.server import JsonRpcServer


def _connection() -> dict:
    return {
        "id": "c1",
        "dialect": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "app",
        "username": "user",
        "password": "secret",
    }


@pytest.fixture
def server() -> JsonRpcServer:
    return JsonRpcServer()


def test_health(server: JsonRpcServer) -> None:
    assert server._health({}) == {"status": "ok", "version": "0.1.0"}


def test_handle_unknown_method(server: JsonRpcServer) -> None:
    response = server._handle({"id": 1, "method": "nope", "params": {}})
    assert response["error"]["code"] == -32601


@patch("sql_studio.server.test_connection")
def test_connection_test(mock_test: MagicMock, server: JsonRpcServer) -> None:
    response = server._handle(
        {"id": 2, "method": "connection/test", "params": {"connection": _connection()}}
    )
    assert response["result"] == {"ok": True}
    mock_test.assert_called_once()
    assert isinstance(mock_test.call_args[0][0], ConnectionConfig)


@patch("sql_studio.server.disconnect")
def test_connection_disconnect(mock_disconnect: MagicMock, server: JsonRpcServer) -> None:
    response = server._handle(
        {
            "id": 3,
            "method": "connection/disconnect",
            "params": {"connectionId": "c1"},
        }
    )
    assert response["result"] == {"ok": True}
    mock_disconnect.assert_called_once_with("c1")


@patch("sql_studio.server.get_driver")
def test_connection_connect(mock_get_driver: MagicMock, server: JsonRpcServer) -> None:
    response = server._handle(
        {
            "id": 31,
            "method": "connection/connect",
            "params": {"connection": _connection()},
        }
    )
    assert response["result"] == {"ok": True}
    mock_get_driver.assert_called_once()
    assert isinstance(mock_get_driver.call_args[0][0], ConnectionConfig)


@patch("sql_studio.server.is_connection_active")
def test_connection_is_connected(
    mock_is_connected: MagicMock, server: JsonRpcServer
) -> None:
    mock_is_connected.return_value = True
    response = server._handle(
        {
            "id": 32,
            "method": "connection/isConnected",
            "params": {"connectionId": "c1"},
        }
    )
    assert response["result"] == {"connected": True}
    mock_is_connected.assert_called_once_with("c1")


@patch("sql_studio.server.cancel_query")
def test_query_cancel(mock_cancel: MagicMock, server: JsonRpcServer) -> None:
    mock_cancel.return_value = True
    response = server._handle(
        {
            "id": 13,
            "method": "query/cancel",
            "params": {"connectionId": "c1"},
        }
    )
    assert response["result"] == {"ok": True}
    mock_cancel.assert_called_once_with("c1")


@patch("sql_studio.server.get_driver")
def test_query_execute_returns_batch(mock_get_driver: MagicMock, server: JsonRpcServer) -> None:
    mock_driver = MagicMock()
    mock_driver.execute.side_effect = [
        QueryResult(columns=[], rows=[], row_count=0, duration_ms=1.0, status_message="OK"),
        QueryResult(
            columns=[QueryColumn(name="x", data_type="integer")],
            rows=[[1]],
            row_count=1,
            duration_ms=2.5,
        ),
    ]
    mock_get_driver.return_value = mock_driver

    response = server._handle(
        {
            "id": 4,
            "method": "query/execute",
            "params": {
                "connection": _connection(),
                "sql": "SELECT 1; SELECT 2;",
            },
        }
    )

    result = response["result"]
    assert len(result["statements"]) == 2
    assert result["statements"][0]["index"] == 1
    assert result["statements"][1]["rows"] == [[1]]
    assert result["total_duration_ms"] == pytest.approx(3.5)


@patch("sql_studio.server.get_driver")
def test_query_execute_stops_on_error(mock_get_driver: MagicMock, server: JsonRpcServer) -> None:
    mock_driver = MagicMock()
    mock_driver.execute.side_effect = [
        QueryResult(columns=[], rows=[], row_count=0, duration_ms=1.0),
        QueryResult(
            columns=[],
            rows=[],
            row_count=0,
            duration_ms=0.5,
            error="syntax error",
        ),
        QueryResult(columns=[], rows=[], row_count=0, duration_ms=0.1),
    ]
    mock_get_driver.return_value = mock_driver

    response = server._handle(
        {
            "id": 5,
            "method": "query/execute",
            "params": {
                "connection": _connection(),
                "sql": "SELECT 1; BAD; SELECT 3;",
            },
        }
    )

    assert len(response["result"]["statements"]) == 2
    assert response["result"]["statements"][1]["error"] == "syntax error"


def test_query_execute_empty_sql_raises(server: JsonRpcServer) -> None:
    response = server._handle(
        {
            "id": 6,
            "method": "query/execute",
            "params": {"connection": _connection(), "sql": "-- only comment"},
        }
    )
    assert response["error"]["code"] == -32000


@patch("sql_studio.server.get_driver")
def test_schema_list_children(mock_get_driver: MagicMock, server: JsonRpcServer) -> None:
    mock_driver = MagicMock()
    mock_driver.list_schema_children.return_value = [
        SchemaNode(id="db:app", label="app", node_type="database", path=["databases", "app"])
    ]
    mock_get_driver.return_value = mock_driver

    response = server._handle(
        {
            "id": 7,
            "method": "schema/listChildren",
            "params": {"connection": _connection(), "path": ["databases"]},
        }
    )

    assert response["result"][0]["label"] == "app"


@patch("sql_studio.server.get_driver")
def test_schema_get_object_description(
    mock_get_driver: MagicMock, server: JsonRpcServer
) -> None:
    from sql_studio.models import ObjectDescription

    mock_driver = MagicMock()
    mock_driver.get_object_description.return_value = ObjectDescription(
        object_type="table",
        qualified_name="public.users",
        ddl="CREATE TABLE public.users (id int)",
    )
    mock_get_driver.return_value = mock_driver

    response = server._handle(
        {
            "id": 14,
            "method": "schema/getObjectDescription",
            "params": {
                "connection": _connection(),
                "path": ["schemas", "public", "users"],
            },
        }
    )

    assert response["result"]["qualified_name"] == "public.users"
    assert response["result"]["ddl"].startswith("CREATE TABLE")


@patch("sql_studio.server.get_driver")
def test_schema_get_table_ddl(mock_get_driver: MagicMock, server: JsonRpcServer) -> None:
    mock_driver = MagicMock()
    mock_driver.get_table_ddl.return_value = "CREATE TABLE t (x Int32)"
    mock_get_driver.return_value = mock_driver

    response = server._handle(
        {
            "id": 8,
            "method": "schema/getTableDDL",
            "params": {
                "connection": _connection(),
                "path": ["databases", "app", "t"],
            },
        }
    )

    assert response["result"]["ddl"] == "CREATE TABLE t (x Int32)"


@patch("sql_studio.server.get_driver")
def test_schema_get_dbml(mock_get_driver: MagicMock, server: JsonRpcServer) -> None:
    mock_driver = MagicMock()
    mock_driver.get_schema_dbml.return_value = SchemaDbmlResult(
        scope="public",
        dbml="Table public.users { id int [pk] }",
        mermaid="erDiagram\n  public_users { int id PK }",
        table_count=1,
        relationship_count=0,
    )
    mock_get_driver.return_value = mock_driver

    response = server._handle(
        {
            "id": 14,
            "method": "schema/getDbml",
            "params": {
                "connection": _connection(),
                "path": ["schemas", "public"],
            },
        }
    )

    assert response["result"]["scope"] == "public"
    assert "public.users" in response["result"]["dbml"]
    assert response["result"]["table_count"] == 1


def test_sql_format(server: JsonRpcServer) -> None:
    response = server._handle(
        {
            "id": 9,
            "method": "sql/format",
            "params": {"sql": "select 1", "dialect": "postgres"},
        }
    )
    assert "SELECT" in response["result"]["sql"].upper()


def test_sql_split(server: JsonRpcServer) -> None:
    response = server._handle(
        {
            "id": 10,
            "method": "sql/split",
            "params": {"sql": "SELECT 1; SELECT 2;", "dialect": "postgres"},
        }
    )
    assert len(response["result"]["statements"]) == 2


@patch("sql_studio.server.get_driver")
def test_sql_check_unbounded_select_warns_on_large_tables(
    mock_get_driver: MagicMock,
    server: JsonRpcServer,
) -> None:
    mock_driver = MagicMock()
    mock_driver.estimate_table_row_count.return_value = 12_345
    mock_get_driver.return_value = mock_driver

    response = server._handle(
        {
            "id": 14,
            "method": "sql/checkUnboundedSelect",
            "params": {
                "connection": _connection(),
                "sql": "SELECT * FROM users",
            },
        }
    )

    warnings = response["result"]["warnings"]
    assert len(warnings) == 1
    assert warnings[0]["table"] == "public.users"
    assert warnings[0]["row_estimate"] == 12_345
    mock_driver.estimate_table_row_count.assert_called_once_with("public", "users")


@patch("sql_studio.server.get_driver")
def test_sql_check_unbounded_select_skips_bounded_query(
    mock_get_driver: MagicMock,
    server: JsonRpcServer,
) -> None:
    mock_get_driver.return_value = MagicMock()

    response = server._handle(
        {
            "id": 15,
            "method": "sql/checkUnboundedSelect",
            "params": {
                "connection": _connection(),
                "sql": "SELECT * FROM users WHERE id = 1",
            },
        }
    )

    assert response["result"]["warnings"] == []
    mock_get_driver.return_value.estimate_table_row_count.assert_not_called()


def test_export_csv(tmp_path, server: JsonRpcServer) -> None:
    out = tmp_path / "out.csv"
    response = server._handle(
        {
            "id": 11,
            "method": "export/csv",
            "params": {
                "path": str(out),
                "columns": ["a", "b"],
                "rows": [[1, 2], [3, None]],
                "bom": True,
            },
        }
    )
    assert response["result"]["row_count"] == 2
    text = out.read_text(encoding="utf-8-sig")
    assert "a,b" in text
    assert "1,2" in text


def test_export_xlsx(tmp_path, server: JsonRpcServer) -> None:
    out = tmp_path / "out.xlsx"
    response = server._handle(
        {
            "id": 12,
            "method": "export/xlsx",
            "params": {
                "path": str(out),
                "columns": ["x"],
                "rows": [[42]],
            },
        }
    )
    assert response["result"]["row_count"] == 1
    assert out.exists()
