"""Tests for sqlglot dialect service."""

from sql_studio.dialect.sqlglot_service import format_sql, is_session_statement, split_statements


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


def test_split_fallback_on_parse_error() -> None:
    sql = "use robotisation; SELECT * FROM message; broken @@"
    parts = split_statements(sql, "clickhouse")
    assert len(parts) == 3
    assert parts[0].upper().startswith("USE")
    assert parts[1].upper().startswith("SELECT")


def test_is_session_statement() -> None:
    assert is_session_statement("use robotisation")
    assert is_session_statement("SET readonly = 1")
    assert not is_session_statement("SELECT 1")


def test_validate_sql_valid() -> None:
    from sql_studio.dialect.sqlglot_service import validate_sql

    assert validate_sql("SELECT 1", "postgres") is None


def test_validate_sql_invalid() -> None:
    from sql_studio.dialect.sqlglot_service import validate_sql

    err = validate_sql("SELECT FROM", "postgres")
    assert err is not None


def test_format_returns_original_on_parse_error() -> None:
    broken = "SELECT @@broken"
    assert format_sql(broken, "postgres") == broken


def test_split_semicolon_inside_string() -> None:
    sql = "SELECT ';' AS x; SELECT 2;"
    parts = split_statements(sql, "postgres")
    assert len(parts) == 2


def test_split_clickhouse_format() -> None:
    parts = split_statements("SELECT 1", "clickhouse")
    assert len(parts) == 1
