"""Tests for EXPLAIN SQL builders."""

from sql_studio.dialect.explain import (
    already_explain,
    attach_plan_text,
    build_explain_sql,
    format_plan_text,
    is_explainable,
)
from sql_studio.models import QueryColumn, QueryResult, StatementResult


def test_is_explainable_select_and_with() -> None:
    assert is_explainable("SELECT 1", "postgres")
    assert is_explainable("WITH cte AS (SELECT 1) SELECT * FROM cte", "clickhouse")
    assert not is_explainable("UPDATE t SET x = 1", "clickhouse")


def test_is_explainable_postgres_dml() -> None:
    assert is_explainable("DELETE FROM t WHERE id = 1", "postgres")


def test_already_explain() -> None:
    assert already_explain("EXPLAIN SELECT 1")
    assert build_explain_sql("EXPLAIN SELECT 1", "postgres") == "EXPLAIN SELECT 1"


def test_build_explain_sql_postgres() -> None:
    sql = build_explain_sql("SELECT 1", "postgres")
    assert sql == "EXPLAIN (FORMAT TEXT) SELECT 1"
    analyzed = build_explain_sql("SELECT 1", "postgres", analyze=True)
    assert "ANALYZE" in analyzed
    assert "BUFFERS" in analyzed


def test_build_explain_sql_other_dialects() -> None:
    assert build_explain_sql("SELECT 1", "clickhouse") == "EXPLAIN SELECT 1"
    assert "SHOWPLAN_ALL ON" in build_explain_sql("SELECT 1", "mssql")
    assert build_explain_sql("SELECT 1", "sqlite") == "EXPLAIN QUERY PLAN SELECT 1"
    assert build_explain_sql("SELECT 1", "mysql") == "EXPLAIN SELECT 1"


def test_format_plan_text_single_column() -> None:
    result = QueryResult(
        columns=[QueryColumn(name="QUERY PLAN")],
        rows=[["Seq Scan on t"], ["  Rows: 1"]],
        row_count=2,
        duration_ms=1.0,
    )
    assert format_plan_text(result) == "Seq Scan on t\n  Rows: 1"


def test_attach_plan_text() -> None:
    stmt = StatementResult(
        index=1,
        sql="SELECT 1",
        columns=[QueryColumn(name="QUERY PLAN")],
        rows=[["Seq Scan on t"]],
        row_count=1,
        duration_ms=1.0,
    )
    with_plan = attach_plan_text(stmt)
    assert with_plan.plan_text == "Seq Scan on t"
