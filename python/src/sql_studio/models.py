"""Pydantic models for JSON-RPC requests and responses."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Dialect = Literal["postgres", "clickhouse"]
ClickHouseInterface = Literal["http", "native"]


class ConnectionConfig(BaseModel):
    id: str
    dialect: Dialect
    host: str
    port: int
    database: str
    username: str
    password: str = ""
    ssl: bool = False
    read_only: bool = False
    clickhouse_interface: ClickHouseInterface | None = None


class ColumnInfo(BaseModel):
    name: str
    data_type: str
    nullable: bool = True
    is_primary_key: bool = False


class SchemaNode(BaseModel):
    id: str
    label: str
    node_type: str
    path: list[str] = Field(default_factory=list)
    has_children: bool = False
    icon: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class QueryColumn(BaseModel):
    name: str
    data_type: str | None = None


class QueryResult(BaseModel):
    columns: list[QueryColumn]
    rows: list[list[Any]]
    row_count: int
    duration_ms: float
    truncated: bool = False
    error: str | None = None


class ExportResult(BaseModel):
    path: str
    row_count: int
