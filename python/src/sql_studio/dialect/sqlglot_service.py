"""SQL dialect utilities powered by sqlglot."""

from __future__ import annotations

import sqlglot
from sqlglot import parse_one


def dialect_read(dialect: str) -> str:
    return "postgres" if dialect == "postgres" else "clickhouse"


def format_sql(sql: str, dialect: str) -> str:
    read = dialect_read(dialect)
    try:
        parsed = parse_one(sql, read=read)
        return parsed.sql(dialect=read, pretty=True)
    except sqlglot.errors.ParseError:
        return sql


def split_statements(sql: str, dialect: str) -> list[str]:
    read = dialect_read(dialect)
    try:
        statements = sqlglot.parse(sql, read=read)
        out: list[str] = []
        for statement in statements:
            if statement is None:
                continue
            text = statement.sql(dialect=read).strip()
            if text:
                out.append(text)
        return out
    except sqlglot.errors.ParseError:
        stripped = _strip_sql_comments(sql).strip()
        return [stripped] if stripped else []


def _strip_sql_comments(sql: str) -> str:
    """Fallback when sqlglot cannot parse: remove line comments, keep SQL."""
    lines: list[str] = []
    for line in sql.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("--"):
            continue
        lines.append(line)
    return "\n".join(lines)


def validate_sql(sql: str, dialect: str) -> str | None:
    read = dialect_read(dialect)
    try:
        parse_one(sql, read=read)
        return None
    except sqlglot.errors.ParseError as exc:
        return str(exc)
