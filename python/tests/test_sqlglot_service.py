"""Tests for sqlglot dialect service."""

from sql_studio.dialect.sqlglot_service import format_sql, split_statements


def test_split_postgres_statements() -> None:
    sql = "SELECT 1; SELECT 2;"
    parts = split_statements(sql, "postgres")
    assert len(parts) == 2


def test_format_postgres() -> None:
    sql = "select 1"
    formatted = format_sql(sql, "postgres")
    assert "SELECT" in formatted.upper()


def test_split_skips_comment_only() -> None:
    sql = "-- only a comment\n"
    parts = split_statements(sql, "clickhouse")
    assert parts == []


def test_split_clickhouse_with_header_comment() -> None:
    sql = "-- Connection: test\n\nSELECT 1"
    parts = split_statements(sql, "clickhouse")
    assert len(parts) == 1
    assert "SELECT 1" in parts[0].upper()
