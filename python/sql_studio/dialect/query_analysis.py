"""Analyze SELECT statements for unbounded table scans."""

from __future__ import annotations

from dataclasses import dataclass

import sqlglot
from sqlglot import exp, parse_one

from sql_studio.dialect.sqlglot_service import dialect_read, is_session_statement


LARGE_TABLE_ROW_THRESHOLD = 5_000


@dataclass(frozen=True)
class TableRef:
    schema: str | None
    name: str


def get_unbounded_select_tables(sql: str, dialect: str) -> list[TableRef]:
    """Return base tables for simple SELECTs without WHERE, LIMIT/TOP, or aggregation."""
    if is_session_statement(sql):
        return []
    read = dialect_read(dialect)
    try:
        parsed = parse_one(sql, read=read)
    except sqlglot.errors.ParseError:
        return []

    if not isinstance(parsed, (exp.Select, exp.Union)):
        return []

    selects = _collect_selects(parsed)
    if not selects:
        return []

    for select in selects:
        if not _is_unbounded_select(select):
            return []

    seen: set[tuple[str | None, str]] = set()
    tables: list[TableRef] = []
    for select in selects:
        for table in select.find_all(exp.Table):
            ref = TableRef(schema=_normalize_identifier(table.db), name=_normalize_identifier(table.name) or "")
            if not ref.name:
                continue
            key = (ref.schema, ref.name)
            if key in seen:
                continue
            seen.add(key)
            tables.append(ref)
    return tables


def _collect_selects(node: exp.Expression) -> list[exp.Select]:
    if isinstance(node, exp.Union):
        out: list[exp.Select] = []
        for branch in node.flatten():
            if isinstance(branch, exp.Select):
                out.append(branch)
            else:
                return []
        return out
    if isinstance(node, exp.Select):
        return [node]
    return []


def _is_unbounded_select(select: exp.Select) -> bool:
    if select.find_ancestor(exp.Subquery) is not None:
        return False
    if select.find(exp.Where):
        return False
    if _has_row_limit(select):
        return False
    if select.find(exp.Group):
        return False
    if select.find(exp.Having):
        return False
    if list(select.find_all(exp.AggFunc)):
        return False
    if not list(select.find_all(exp.Table)):
        return False
    return True


def _has_row_limit(select: exp.Select) -> bool:
    if select.args.get("limit") is not None:
        return True
    if select.args.get("top") is not None:
        return True
    fetch = select.args.get("fetch")
    if fetch is not None:
        return True
    return False


def _normalize_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text[0] in {'"', "'", "`", "["}:
        text = text[1:]
    if text and text[-1] in {'"', "'", "`", "]"}:
        text = text[:-1]
    return text or None
