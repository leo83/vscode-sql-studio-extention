"""Database driver protocol."""

from __future__ import annotations

from typing import Protocol

from sql_studio.models import (
    ColumnInfo,
    ConnectionConfig,
    ObjectDescription,
    QueryResult,
    SchemaNode,
)


class DatabaseDriver(Protocol):
    def connect(self, config: ConnectionConfig) -> None: ...

    def disconnect(self) -> None: ...

    def test_connection(self) -> None: ...

    def execute(self, sql: str, limit: int | None = 10_000) -> QueryResult: ...

    def list_schema_children(self, path: list[str]) -> list[SchemaNode]: ...

    def get_table_ddl(self, path: list[str]) -> str: ...

    def get_object_description(self, path: list[str]) -> ObjectDescription: ...
