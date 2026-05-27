"""Tests for Pydantic models."""

import pytest
from pydantic import ValidationError

from sql_studio.models import (
    ConnectionConfig,
    ExportResult,
    QueryExecuteResult,
    QueryResult,
    SchemaNode,
    StatementResult,
)


def test_connection_config_defaults() -> None:
    cfg = ConnectionConfig(
        id="1",
        dialect="postgres",
        host="localhost",
        port=5432,
        database="app",
        username="user",
    )
    assert cfg.password == ""
    assert cfg.ssl is False
    assert cfg.read_only is False
    assert cfg.clickhouse_interface is None


def test_connection_config_clickhouse_interface() -> None:
    cfg = ConnectionConfig(
        id="2",
        dialect="clickhouse",
        host="ch.local",
        port=9000,
        database="default",
        username="default",
        clickhouse_interface="native",
    )
    assert cfg.clickhouse_interface == "native"


def test_connection_config_mssql() -> None:
    cfg = ConnectionConfig(
        id="4",
        dialect="mssql",
        host="sql.local",
        port=1433,
        database="master",
        username="sa",
    )
    assert cfg.dialect == "mssql"


def test_connection_config_mysql() -> None:
    cfg = ConnectionConfig(
        id="5",
        dialect="mysql",
        host="mysql.local",
        port=3306,
        database="app",
        username="root",
    )
    assert cfg.dialect == "mysql"


def test_connection_config_sqlite() -> None:
    cfg = ConnectionConfig(
        id="6",
        dialect="sqlite",
        host="localhost",
        port=0,
        database="/tmp/app.sqlite",
        username="",
    )
    assert cfg.dialect == "sqlite"


def test_connection_config_invalid_dialect() -> None:
    with pytest.raises(ValidationError):
        ConnectionConfig(
            id="3",
            dialect="oracle",  # type: ignore[arg-type]
            host="localhost",
            port=3306,
            database="app",
            username="user",
        )


def test_query_result_optional_fields() -> None:
    result = QueryResult(columns=[], rows=[], row_count=0, duration_ms=0.5)
    assert result.error is None
    assert result.truncated is False
    assert result.status_message is None


def test_statement_result_includes_sql() -> None:
    stmt = StatementResult(
        index=1,
        sql="SELECT 1",
        columns=[],
        rows=[],
        row_count=0,
        duration_ms=1.0,
    )
    dumped = stmt.model_dump()
    assert dumped["sql"] == "SELECT 1"
    assert dumped["index"] == 1


def test_query_execute_result_total_duration() -> None:
    batch = QueryExecuteResult(
        statements=[
            StatementResult(
                index=1,
                sql="SELECT 1",
                columns=[],
                rows=[],
                row_count=0,
                duration_ms=2.0,
            )
        ],
        total_duration_ms=2.0,
    )
    assert batch.total_duration_ms == 2.0


def test_schema_node_metadata_default() -> None:
    node = SchemaNode(id="n1", label="Tables", node_type="folder")
    assert node.metadata == {}
    assert node.path == []


def test_export_result() -> None:
    exported = ExportResult(path="/tmp/out.csv", row_count=10)
    assert exported.model_dump() == {"path": "/tmp/out.csv", "row_count": 10}
