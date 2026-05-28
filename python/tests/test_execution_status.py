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
    assert clickhouse_status("use app_db;", None) == "Database changed to `app_db`"


def test_clickhouse_status_written_rows() -> None:
    assert clickhouse_status("INSERT INTO t VALUES (1)", {"written_rows": 3}) == "3 rows inserted"


def test_clickhouse_status_create_drop_alter() -> None:
    assert clickhouse_status("CREATE TABLE t (x UInt8)", None) == "Create completed"
    assert clickhouse_status("DROP TABLE t", None) == "Drop completed"
    assert clickhouse_status("ALTER TABLE t ADD COLUMN y UInt8", None) == "Alter completed"


def test_clickhouse_status_set() -> None:
    assert clickhouse_status("SET readonly = 1", None) == "Setting applied"


def test_clickhouse_status_single_row_affected() -> None:
    assert clickhouse_status("DELETE FROM t", {"written_rows": 1}) == "1 row deleted"


def test_postgres_status_default_message() -> None:
    assert postgres_status("CREATE TABLE t (x int)", None, None) == "Query executed successfully."


def test_is_result_set_query_with_explain_and_with() -> None:
    assert is_result_set_query("EXPLAIN SELECT 1")
    assert is_result_set_query("WITH cte AS (SELECT 1) SELECT * FROM cte")
    assert is_result_set_query("DESCRIBE TABLE t")
