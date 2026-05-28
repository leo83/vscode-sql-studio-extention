"""Table row-count estimates for pre-query warnings."""

from __future__ import annotations

from typing import Any

from sql_studio.models import ConnectionConfig, Dialect


def resolve_table_schema(
    dialect: Dialect,
    table_schema: str | None,
    *,
    config: ConnectionConfig,
    active_database: str | None,
) -> str:
    if table_schema:
        return table_schema
    if dialect in {"mysql", "clickhouse"}:
        return active_database or config.database
    if dialect == "mssql":
        return "dbo"
    if dialect == "sqlite":
        return "main"
    return "public"


def format_qualified_table(dialect: Dialect, schema: str, table: str) -> str:
    if dialect in {"mysql", "clickhouse"}:
        return f"{schema}.{table}"
    if dialect == "sqlite" and schema == "main":
        return table
    return f"{schema}.{table}"


def estimate_table_row_count(driver: Any, dialect: Dialect, schema: str, table: str) -> int | None:
    estimator = getattr(driver, "estimate_table_row_count", None)
    if not callable(estimator):
        return None
    return estimator(schema, table)
