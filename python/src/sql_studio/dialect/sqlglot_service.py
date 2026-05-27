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
        if out:
            return out
    except sqlglot.errors.ParseError:
        pass
    return _split_statements_by_semicolon(sql)


def is_session_statement(sql: str) -> bool:
    stripped = _strip_sql_comments(sql).strip().rstrip(";").strip()
    if not stripped:
        return False
    first = stripped.split()[0].upper()
    return first in {"USE", "SET"}


def _split_statements_by_semicolon(sql: str) -> list[str]:
    """Fallback split when sqlglot cannot parse the buffer."""
    ranges = _find_statement_ranges(sql)
    out: list[str] = []
    for start, end in ranges:
        text = sql[start:end].strip()
        if not text:
            continue
        stripped = _strip_sql_comments(text).strip()
        if stripped:
            out.append(stripped)
    return out


def _find_statement_ranges(sql: str) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    start = 0
    i = 0
    in_single = False
    in_double = False
    in_backtick = False
    in_line_comment = False
    in_block_comment = False

    while i < len(sql):
        ch = sql[i]
        next_ch = sql[i + 1] if i + 1 < len(sql) else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and next_ch == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_single:
            if ch == "'" and next_ch == "'":
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue

        if in_double:
            if ch == '"':
                in_double = False
            i += 1
            continue

        if in_backtick:
            if ch == "`":
                in_backtick = False
            i += 1
            continue

        if ch == "-" and next_ch == "-":
            in_line_comment = True
            i += 2
            continue

        if ch == "/" and next_ch == "*":
            in_block_comment = True
            i += 2
            continue

        if ch == "'":
            in_single = True
            i += 1
            continue

        if ch == '"':
            in_double = True
            i += 1
            continue

        if ch == "`":
            in_backtick = True
            i += 1
            continue

        if ch == ";":
            ranges.append((start, i))
            start = i + 1
            i += 1
            continue

        i += 1

    if start < len(sql):
        ranges.append((start, len(sql)))
    return ranges


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
