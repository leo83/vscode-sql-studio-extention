"""Tests for structured plan parsers."""

import json

from sql_studio.dialect.plan_parsers.base import parse_indented_text_plan, plan_tree_to_text
from sql_studio.dialect.plan_parsers.clickhouse import parse as parse_clickhouse
from sql_studio.dialect.plan_parsers.mysql import parse as parse_mysql
from sql_studio.dialect.plan_parsers.postgres import parse as parse_postgres
from sql_studio.dialect.plan_parsers.sqlite import parse as parse_sqlite
from sql_studio.models import QueryColumn, QueryResult


def test_parse_indented_text_plan() -> None:
    text = "\n".join(
        [
            "Limit",
            "  Seq Scan on users",
            "    Filter: (active = true)",
        ]
    )
    tree = parse_indented_text_plan(text)
    assert len(tree) == 1
    assert tree[0].kind == "Limit"
    assert tree[0].children[0].kind == "Seq"
    assert tree[0].children[0].children[0].title == "Filter: (active = true)"


def test_plan_tree_to_text_roundtrip() -> None:
    tree = parse_indented_text_plan("Aggregate\n  Seq Scan on t")
    text = plan_tree_to_text(tree)
    assert "Aggregate" in text
    assert "Seq Scan on t" in text


def test_parse_postgres_json() -> None:
    payload = [
        {
            "Plan": {
                "Node Type": "Limit",
                "Plans": [
                    {
                        "Node Type": "Seq Scan",
                        "Relation Name": "message",
                        "Total Cost": 100.0,
                        "Plan Rows": 1000,
                    }
                ],
            }
        }
    ]
    result = QueryResult(
        columns=[QueryColumn(name="QUERY PLAN")],
        rows=[[json.dumps(payload)]],
        row_count=1,
        duration_ms=1.0,
    )
    parsed = parse_postgres(result)
    assert parsed.plan_tree
    assert parsed.plan_tree[0].kind == "Limit"
    assert parsed.plan_tree[0].children[0].kind == "Seq Scan"
    assert parsed.plan_tree[0].children[0].tags == ["full_scan"]


def test_parse_clickhouse_json() -> None:
    payload = [
        {
            "Plan": {
                "Node Type": "Expression",
                "Plans": [{"Node Type": "ReadFromMergeTree", "Description": "robotisation.message"}],
            }
        }
    ]
    result = QueryResult(
        columns=[QueryColumn(name="explain")],
        rows=[[json.dumps(payload)]],
        row_count=1,
        duration_ms=1.0,
    )
    parsed = parse_clickhouse(result)
    assert parsed.plan_tree
    assert parsed.plan_tree[0].children[0].kind == "ReadFromMergeTree"


def test_parse_mysql_classic_table() -> None:
    result = QueryResult(
        columns=[
            QueryColumn(name="id"),
            QueryColumn(name="select_type"),
            QueryColumn(name="table"),
            QueryColumn(name="type"),
            QueryColumn(name="possible_keys"),
            QueryColumn(name="key"),
            QueryColumn(name="rows"),
            QueryColumn(name="Extra"),
        ],
        rows=[
            ["1", "SIMPLE", "users", "ALL", None, None, "1000", "Using where"],
        ],
        row_count=1,
        duration_ms=1.0,
    )
    parsed = parse_mysql(result)
    assert parsed.plan_tree
    assert parsed.plan_tree[0].kind == "ALL"
    assert parsed.plan_tree[0].tags == ["full_scan"]


def test_parse_sqlite_query_plan() -> None:
    result = QueryResult(
        columns=[
            QueryColumn(name="id"),
            QueryColumn(name="parent"),
            QueryColumn(name="notused"),
            QueryColumn(name="detail"),
        ],
        rows=[
            [3, 0, 0, "SCAN message"],
            [4, 3, 0, "SEARCH message USING INDEX message_id (id=?)"],
        ],
        row_count=2,
        duration_ms=1.0,
    )
    parsed = parse_sqlite(result)
    assert parsed.plan_tree
    assert parsed.plan_tree[0].title == "SCAN message"
    assert parsed.plan_tree[0].children[0].title.startswith("SEARCH message")
