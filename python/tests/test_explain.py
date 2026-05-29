"""Tests for EXPLAIN SQL builders and plan attachment."""

import json

from sql_studio.dialect.explain import (
    already_explain,
    attach_plan,
    attach_plan_text,
    build_explain_sql,
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
    assert sql == "EXPLAIN (FORMAT JSON) SELECT 1"
    analyzed = build_explain_sql("SELECT 1", "postgres", analyze=True)
    assert "ANALYZE" in analyzed
    assert "BUFFERS" in analyzed
    assert "FORMAT JSON" in analyzed


def test_build_explain_sql_other_dialects() -> None:
    assert build_explain_sql("SELECT 1", "clickhouse") == "EXPLAIN json=1 SELECT 1"
    assert "SHOWPLAN_XML ON" in build_explain_sql("SELECT 1", "mssql")
    assert build_explain_sql("SELECT 1", "sqlite") == "EXPLAIN QUERY PLAN SELECT 1"
    assert build_explain_sql("SELECT 1", "mysql") == "EXPLAIN FORMAT=JSON SELECT 1"


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


def test_attach_plan_postgres_json() -> None:
    plan = {
        "Plan": {
            "Node Type": "Seq Scan",
            "Relation Name": "message",
            "Alias": "message",
            "Startup Cost": 0.0,
            "Total Cost": 10.0,
            "Plan Rows": 100,
            "Plan Width": 32,
        }
    }
    stmt = StatementResult(
        index=1,
        sql="SELECT * FROM message",
        columns=[QueryColumn(name="QUERY PLAN")],
        rows=[[json.dumps([{"Plan": plan["Plan"]}])]],
        row_count=1,
        duration_ms=2.0,
    )
    with_plan = attach_plan(stmt, "postgres")
    assert with_plan.plan_tree is not None
    assert with_plan.plan_tree[0].kind == "Seq Scan"
    assert with_plan.plan_format == "tree"
    assert with_plan.plan_text is not None


def test_attach_plan_clickhouse_text_fallback() -> None:
    text = "\n".join(
        [
            "Expression ((Project names + Projection))",
            "  Limit (preliminary LIMIT)",
            "    ReadFromMergeTree (robotisation.message)",
        ]
    )
    stmt = StatementResult(
        index=1,
        sql="SELECT * FROM message LIMIT 10",
        columns=[QueryColumn(name="explain")],
        rows=[[line] for line in text.splitlines()],
        row_count=3,
        duration_ms=1.0,
    )
    with_plan = attach_plan(stmt, "clickhouse")
    assert with_plan.plan_tree is not None
    assert "ReadFromMergeTree" in (with_plan.plan_text or "")


def test_attach_plan_sqlite() -> None:
    stmt = StatementResult(
        index=1,
        sql="SELECT * FROM t",
        columns=[
            QueryColumn(name="id"),
            QueryColumn(name="parent"),
            QueryColumn(name="notused"),
            QueryColumn(name="detail"),
        ],
        rows=[
            [2, 0, 0, "SCAN t"],
            [3, 0, 0, "USE TEMP B-TREE FOR ORDER BY"],
        ],
        row_count=2,
        duration_ms=1.0,
    )
    with_plan = attach_plan(stmt, "sqlite")
    assert with_plan.plan_tree is not None
    assert with_plan.plan_tree[0].title == "SCAN t"
