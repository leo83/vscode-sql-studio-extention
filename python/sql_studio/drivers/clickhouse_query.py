"""Build tabular QueryResult from ClickHouse query responses."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sql_studio.models import QueryColumn, QueryResult


def normalize_column_names(
    column_names: list[Any] | None,
    rows: list[list[Any]],
) -> list[str]:
    raw = [str(name).strip() if name is not None else "" for name in (column_names or [])]
    if raw and any(raw):
        return [name if name else f"column_{index + 1}" for index, name in enumerate(raw)]
    if not rows:
        return []
    width = len(rows[0]) if rows else 0
    return [f"column_{index + 1}" for index in range(width)]


def build_query_result(
    *,
    sql: str,
    column_names: list[Any] | None,
    column_types: list[Any] | None,
    rows: list[Any],
    duration_ms: float,
    limit: int,
    status_for_empty: Callable[[str], str],
) -> QueryResult:
    """Return a result grid when rows exist; otherwise a status-only result."""
    all_rows = [list(row) for row in rows]
    names = normalize_column_names(column_names, all_rows)
    if not names and not all_rows:
        return QueryResult(
            columns=[],
            rows=[],
            row_count=0,
            duration_ms=duration_ms,
            status_message=status_for_empty(sql),
        )

    types = list(column_types or [])
    columns = [
        QueryColumn(
            name=names[index],
            data_type=str(types[index]) if index < len(types) else None,
        )
        for index in range(len(names))
    ]
    truncated = len(all_rows) > limit
    rows_slice = all_rows[:limit]
    return QueryResult(
        columns=columns,
        rows=rows_slice,
        row_count=len(rows_slice),
        duration_ms=duration_ms,
        truncated=truncated,
    )
