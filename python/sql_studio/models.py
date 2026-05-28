"""Pydantic models for JSON-RPC requests and responses."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Dialect = Literal["postgres", "clickhouse", "mssql", "mysql", "sqlite"]
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
    default: str | None = None
    comment: str | None = None


class ObjectDescriptionSection(BaseModel):
    title: str
    rows: list[dict[str, Any]] = Field(default_factory=list)


class ObjectDescription(BaseModel):
    object_type: str
    qualified_name: str
    ddl: str | None = None
    columns: list[ColumnInfo] = Field(default_factory=list)
    sections: list[ObjectDescriptionSection] = Field(default_factory=list)


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
    status_message: str | None = None


class StatementResult(QueryResult):
    """Single statement outcome within a multi-statement batch."""

    index: int
    sql: str
    plan_text: str | None = None


class QueryExecuteResult(BaseModel):
    statements: list[StatementResult]
    total_duration_ms: float


class ExportResult(BaseModel):
    path: str
    row_count: int


class LargeTableWarning(BaseModel):
    table: str
    row_estimate: int
    message: str


class CheckUnboundedSelectResult(BaseModel):
    warnings: list[LargeTableWarning] = Field(default_factory=list)


class SchemaDbmlResult(BaseModel):
    scope: str
    dbml: str
    mermaid: str
    table_count: int = 0
    relationship_count: int = 0
