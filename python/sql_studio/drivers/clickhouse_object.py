"""Shared ClickHouse object description helpers."""

from __future__ import annotations

from typing import Any, Callable, Protocol

from sql_studio.models import ColumnInfo, ObjectDescription, ObjectDescriptionSection


class _QueryClient(Protocol):
    def query(self, sql: str, parameters: dict[str, Any] | None = None) -> Any: ...

    def command(self, sql: str) -> Any: ...


def get_clickhouse_object_description(
    client: _QueryClient,
    path: list[str],
    *,
    execute: Callable[[str], list[tuple[Any, ...]]] | None = None,
) -> ObjectDescription:
    if len(path) < 3 or path[0] != "databases":
        return ObjectDescription(
            object_type="unknown",
            qualified_name=".".join(path),
        )

    database, table = path[1], path[2]

    if len(path) == 4:
        return _describe_clickhouse_column(client, database, table, path[3])

    rows = client.query(
        """
        SELECT engine, total_rows, total_bytes, comment
        FROM system.tables
        WHERE database = {db:String} AND name = {tbl:String}
        """,
        parameters={"db": database, "tbl": table},
    ).result_rows or []
    engine = ""
    total_rows = ""
    total_bytes = ""
    comment = ""
    if rows:
        row = rows[0]
        engine = str(row[0]) if len(row) > 0 else ""
        total_rows = str(row[1]) if len(row) > 1 and row[1] is not None else ""
        total_bytes = str(row[2]) if len(row) > 2 and row[2] is not None else ""
        comment = str(row[3]) if len(row) > 3 and row[3] is not None else ""

    object_type = "view" if "View" in engine else "table"

    ddl = ""
    try:
        if execute is not None:
            ddl_rows = execute(f"SHOW CREATE TABLE `{database}`.`{table}`")
            if ddl_rows and ddl_rows[0]:
                ddl = str(ddl_rows[0][0])
        else:
            ddl_value = client.command(f"SHOW CREATE TABLE `{database}`.`{table}`")
            ddl = str(ddl_value) if ddl_value else ""
    except Exception:
        ddl = f"-- {database}.{table}"

    col_rows = client.query(
        """
        SELECT name, type, default_kind, default_expression, comment, is_in_primary_key
        FROM system.columns
        WHERE database = {db:String} AND table = {tbl:String}
        ORDER BY position
        """,
        parameters={"db": database, "tbl": table},
    ).result_rows or []

    columns = [
        ColumnInfo(
            name=str(row[0]),
            data_type=str(row[1]),
            nullable=True,
            is_primary_key=bool(row[5]) if len(row) > 5 else False,
            default=str(row[3]) if len(row) > 3 and row[3] else None,
            comment=str(row[4]) if len(row) > 4 and row[4] else None,
        )
        for row in col_rows
    ]

    sections = [
        ObjectDescriptionSection(
            title="General",
            rows=[
                {"Property": "Database", "Value": database},
                {"Property": "Name", "Value": table},
                {"Property": "Engine", "Value": engine},
                {"Property": "Type", "Value": object_type},
                {"Property": "Total rows", "Value": total_rows},
                {"Property": "Total bytes", "Value": total_bytes},
                {"Property": "Comment", "Value": comment},
            ],
        )
    ]

    return ObjectDescription(
        object_type=object_type,
        qualified_name=f"{database}.{table}",
        ddl=ddl,
        columns=columns,
        sections=sections,
    )


def _describe_clickhouse_column(
    client: _QueryClient, database: str, table: str, column: str
) -> ObjectDescription:
    rows = client.query(
        """
        SELECT name, type, default_kind, default_expression, comment, is_in_primary_key
        FROM system.columns
        WHERE database = {db:String} AND table = {tbl:String} AND name = {col:String}
        """,
        parameters={"db": database, "tbl": table, "col": column},
    ).result_rows or []
    if not rows:
        return ObjectDescription(
            object_type="column",
            qualified_name=f"{database}.{table}.{column}",
        )
    row = rows[0]
    return ObjectDescription(
        object_type="column",
        qualified_name=f"{database}.{table}.{column}",
        columns=[
            ColumnInfo(
                name=str(row[0]),
                data_type=str(row[1]),
                nullable=True,
                is_primary_key=bool(row[5]) if len(row) > 5 else False,
                default=str(row[3]) if len(row) > 3 and row[3] else None,
                comment=str(row[4]) if len(row) > 4 and row[4] else None,
            )
        ],
        sections=[
            ObjectDescriptionSection(
                title="Properties",
                rows=[
                    {"Property": "Database", "Value": database},
                    {"Property": "Table", "Value": table},
                    {"Property": "Column", "Value": column},
                    {"Property": "Type", "Value": str(row[1])},
                    {"Property": "Default kind", "Value": str(row[2]) if len(row) > 2 else ""},
                    {
                        "Property": "Default",
                        "Value": str(row[3]) if len(row) > 3 and row[3] else "",
                    },
                    {
                        "Property": "Comment",
                        "Value": str(row[4]) if len(row) > 4 and row[4] else "",
                    },
                ],
            )
        ],
    )
