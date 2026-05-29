"""Build and format EXPLAIN queries per database dialect."""

from __future__ import annotations

from sql_studio.dialect.plan_parsers import parse_plan, plan_tree_to_text
from sql_studio.dialect.plan_parsers.base import format_plan_text
from sql_studio.dialect.sqlglot_service import _strip_sql_comments
from sql_studio.models import StatementResult


def already_explain(sql: str) -> bool:
    stripped = _strip_sql_comments(sql).strip().upper()
    return stripped.startswith("EXPLAIN")


def is_explainable(sql: str, dialect: str) -> bool:
    if already_explain(sql):
        return True
    stripped = _strip_sql_comments(sql).strip().upper()
    if not stripped:
        return False
    first = stripped.split()[0]
    if first in {"SELECT", "WITH"}:
        return True
    if dialect == "postgres" and first in {"INSERT", "UPDATE", "DELETE", "MERGE"}:
        return True
    return False


def build_explain_sql(sql: str, dialect: str, *, analyze: bool = False) -> str:
    if already_explain(sql):
        return sql
    if dialect == "postgres":
        options = ["FORMAT JSON"]
        if analyze:
            options.extend(["ANALYZE", "BUFFERS"])
        opts = ", ".join(options)
        return f"EXPLAIN ({opts}) {sql}"
    if dialect == "clickhouse":
        return f"EXPLAIN json=1 {sql}"
    if dialect == "mssql":
        return f"SET SHOWPLAN_XML ON;\n{sql}\nSET SHOWPLAN_XML OFF;"
    if dialect == "sqlite":
        return f"EXPLAIN QUERY PLAN {sql}"
    if dialect == "mysql":
        return f"EXPLAIN FORMAT=JSON {sql}"
    return f"EXPLAIN {sql}"


def attach_plan(statement: StatementResult, dialect: str) -> StatementResult:
    """Parse structured EXPLAIN output and attach plan_tree/plan_text/plan_format."""
    parsed = parse_plan(dialect, statement)
    updates: dict[str, object] = {}
    if parsed.plan_tree:
        updates["plan_tree"] = parsed.plan_tree
    if parsed.plan_text:
        updates["plan_text"] = parsed.plan_text
    elif parsed.plan_tree:
        updates["plan_text"] = plan_tree_to_text(parsed.plan_tree)
    else:
        text = format_plan_text(statement)
        if text:
            updates["plan_text"] = text
    if parsed.plan_format:
        updates["plan_format"] = parsed.plan_format
    if not updates:
        return statement
    return statement.model_copy(update=updates)


def attach_plan_text(statement: StatementResult) -> StatementResult:
    """Backward-compatible helper when dialect is unknown."""
    text = format_plan_text(statement)
    if text is None:
        return statement
    return statement.model_copy(update={"plan_text": text})
