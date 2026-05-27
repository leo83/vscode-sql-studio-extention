"""Human-readable execution status for queries without result sets."""

from __future__ import annotations

from typing import Any

from sql_studio.dialect.sqlglot_service import _strip_sql_comments


def is_result_set_query(sql: str) -> bool:
    stripped = _strip_sql_comments(sql).strip()
    if not stripped:
        return False
    first = stripped.split()[0].upper()
    return first in {"SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH"}


def postgres_status(sql: str, statusmessage: str | None, rowcount: int | None) -> str:
    message = (statusmessage or "").strip()
    if message:
        return message
    if rowcount is not None and rowcount >= 0:
        return _rows_affected_message(rowcount, sql)
    return "Query executed successfully."


def clickhouse_status(sql: str, response: Any = None) -> str:
    written = _written_rows(response)
    if written is not None and written >= 0:
        return _rows_affected_message(written, sql)

    text = _plain_response_text(response)
    if text:
        return text

    stripped = _strip_sql_comments(sql).strip()
    upper = stripped.upper()
    if upper.startswith("USE"):
        parts = stripped.split()
        if len(parts) >= 2:
            database = parts[1].strip("`;").rstrip(";")
            return f"Database changed to `{database}`"
        return "Database changed"

    if upper.startswith("UPDATE"):
        return "Update completed"
    if upper.startswith("INSERT"):
        return "Insert completed"
    if upper.startswith("DELETE"):
        return "Delete completed"
    if upper.startswith("ALTER"):
        return "Alter completed"
    if upper.startswith("CREATE"):
        return "Create completed"
    if upper.startswith("DROP"):
        return "Drop completed"
    if upper.startswith("TRUNCATE"):
        return "Truncate completed"
    if upper.startswith("SET"):
        return "Setting applied"
    return "Query executed successfully."


def _plain_response_text(response: Any) -> str:
    if response is None:
        return ""
    if isinstance(response, str):
        return response.strip()
    if isinstance(response, dict):
        for key in ("message", "status", "result"):
            value = response.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    text = str(response).strip()
    return "" if text in {"", "None", "Ok.", "Ok"} else text


def _written_rows(response: Any) -> int | None:
    if response is None:
        return None
    if isinstance(response, dict):
        for key in ("written_rows", "rows_written", "affected_rows"):
            value = response.get(key)
            if isinstance(value, int):
                return value
        return None
    for attr in ("written_rows", "rows_written", "affected_rows"):
        value = getattr(response, attr, None)
        if isinstance(value, int):
            return value
    return None


def _rows_affected_message(count: int, sql: str) -> str:
    stripped = _strip_sql_comments(sql).strip().upper()
    verb = "affected"
    if stripped.startswith("UPDATE"):
        verb = "updated"
    elif stripped.startswith("INSERT"):
        verb = "inserted"
    elif stripped.startswith("DELETE"):
        verb = "deleted"
    label = "row" if count == 1 else "rows"
    return f"{count} {label} {verb}"
