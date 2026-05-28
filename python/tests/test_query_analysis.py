"""Tests for unbounded SELECT analysis."""

from sql_studio.dialect.query_analysis import get_unbounded_select_tables


def test_simple_select_without_where() -> None:
    tables = get_unbounded_select_tables("SELECT * FROM users", "postgres")
    assert [table.name for table in tables] == ["users"]


def test_select_with_where_is_skipped() -> None:
    assert get_unbounded_select_tables("SELECT * FROM users WHERE active = 1", "postgres") == []


def test_aggregating_select_is_skipped() -> None:
    assert get_unbounded_select_tables("SELECT count(*) FROM users", "postgres") == []


def test_select_with_limit_is_skipped() -> None:
    assert get_unbounded_select_tables("SELECT * FROM users LIMIT 10", "postgres") == []


def test_join_collects_all_tables() -> None:
    tables = get_unbounded_select_tables(
        "SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id",
        "postgres",
    )
    assert {table.name for table in tables} == {"users", "orders"}


def test_union_requires_all_branches_unbounded() -> None:
    sql = "SELECT * FROM users UNION SELECT * FROM orders WHERE id = 1"
    assert get_unbounded_select_tables(sql, "postgres") == []


def test_union_all_tables() -> None:
    sql = "SELECT * FROM users UNION SELECT * FROM orders"
    tables = get_unbounded_select_tables(sql, "postgres")
    assert {table.name for table in tables} == {"users", "orders"}


def test_session_statement_is_skipped() -> None:
    assert get_unbounded_select_tables("USE analytics", "mysql") == []
