"""Tests for execution status formatting."""

from sql_studio.execution_status import (
    clickhouse_status,
    is_result_set_query,
    postgres_status,
)


def test_is_result_set_query() -> None:
    assert is_result_set_query("SELECT 1")
    assert is_result_set_query("  -- comment\nSHOW TABLES")
    assert not is_result_set_query("USE db")
    assert not is_result_set_query("UPDATE t SET x = 1")


def test_postgres_status_uses_statusmessage() -> None:
    assert postgres_status("UPDATE t SET x = 1", "UPDATE 100", 100) == "UPDATE 100"


def test_postgres_status_formats_rowcount() -> None:
    assert postgres_status("UPDATE t SET x = 1", "", 100) == "100 rows updated"


def test_clickhouse_status_use() -> None:
    assert clickhouse_status("use robotisation;", None) == "Database changed to `robotisation`"


def test_clickhouse_status_written_rows() -> None:
    assert clickhouse_status("INSERT INTO t VALUES (1)", {"written_rows": 3}) == "3 rows inserted"
