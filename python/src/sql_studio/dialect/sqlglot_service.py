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
        return [s.sql(dialect=read) for s in statements if s is not None]
    except sqlglot.errors.ParseError:
        return [sql.strip()] if sql.strip() else []


def validate_sql(sql: str, dialect: str) -> str | None:
    read = dialect_read(dialect)
    try:
        parse_one(sql, read=read)
        return None
    except sqlglot.errors.ParseError as exc:
        return str(exc)
