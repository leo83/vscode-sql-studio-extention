"""Build and format EXPLAIN queries per database dialect."""

from __future__ import annotations

import json
from typing import Any

from sql_studio.dialect.sqlglot_service import _strip_sql_comments
from sql_studio.models import QueryResult, StatementResult


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
        options = ["FORMAT TEXT"]
        if analyze:
            options.extend(["ANALYZE", "BUFFERS"])
        opts = ", ".join(options)
        return f"EXPLAIN ({opts}) {sql}"
    if dialect == "clickhouse":
        return f"EXPLAIN {sql}"
    if dialect == "mssql":
        return f"SET SHOWPLAN_ALL ON;\n{sql}\nSET SHOWPLAN_ALL OFF;"
    if dialect == "sqlite":
        return f"EXPLAIN QUERY PLAN {sql}"
    if dialect == "mysql":
        return f"EXPLAIN {sql}"
    return f"EXPLAIN {sql}"


def attach_plan_text(statement: StatementResult) -> StatementResult:
    """Add plan_text for single-column text plans (e.g. PostgreSQL EXPLAIN FORMAT TEXT)."""
    if len(statement.columns) != 1:
        return statement
    text = format_plan_text(statement)
    if text is None:
        return statement
    return statement.model_copy(update={"plan_text": text})


def format_plan_text(result: QueryResult | StatementResult) -> str | None:
    if result.error:
        return None
    if not result.rows:
        message = (result.status_message or "").strip()
        return message or "No execution plan returned."

    if len(result.columns) == 1:
        lines: list[str] = []
        for row in result.rows:
            if not row:
                continue
            cell = row[0]
            if cell is None:
                continue
            if isinstance(cell, (dict, list)):
                lines.append(json.dumps(cell, indent=2, default=str))
            else:
                lines.append(str(cell))
        joined = "\n".join(lines).strip()
        return joined or None

    header = " | ".join(column.name for column in result.columns)
    body_lines: list[str] = []
    for row in result.rows:
        cells = ["" if value is None else str(value) for value in row]
        body_lines.append(" | ".join(cells))
    return "\n".join([header, "-" * min(len(header), 80), *body_lines])
