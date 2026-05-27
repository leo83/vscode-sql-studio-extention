"""Apply ClickHouse session statements to pooled client state."""

from __future__ import annotations

from typing import Any

from sql_studio.dialect.sqlglot_service import _strip_sql_comments


def parse_use_database(sql: str) -> str | None:
    stripped = _strip_sql_comments(sql).strip().rstrip(";").strip()
    if not stripped:
        return None
    parts = stripped.split()
    if len(parts) < 2 or parts[0].upper() != "USE":
        return None
    return parts[1].strip("`;\"'[]")


def apply_use_database(client: Any, sql: str) -> None:
    database = parse_use_database(sql)
    if database:
        set_client_database(client, database)


def set_client_database(client: Any, database: str) -> None:
    module = getattr(type(client), "__module__", "")
    if module.startswith("clickhouse_driver"):
        connection = getattr(client, "connection", None)
        if connection is not None:
            connection.database = database
        return
    if hasattr(client, "database"):
        client.database = database
        return
    connection = getattr(client, "connection", None)
    if connection is not None and hasattr(connection, "database"):
        connection.database = database
