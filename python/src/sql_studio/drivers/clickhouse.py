"""ClickHouse driver — HTTP (clickhouse-connect) or native TCP (clickhouse-driver)."""

from __future__ import annotations

from typing import Protocol

from sql_studio.models import ClickHouseInterface, ConnectionConfig, QueryResult, SchemaNode

from sql_studio.drivers.clickhouse_http import ClickHouseHttpDriver
from sql_studio.drivers.clickhouse_native import ClickHouseNativeDriver

_NATIVE_PORTS = {9000, 9440}
_HTTP_PORTS = {8123, 8443}


class _ClickHouseBackend(Protocol):
    def connect(self, config: ConnectionConfig) -> None: ...
    def disconnect(self) -> None: ...
    def test_connection(self) -> None: ...
    def execute(self, sql: str, limit: int | None = 10_000) -> QueryResult: ...
    def list_schema_children(self, path: list[str]) -> list[SchemaNode]: ...
    def get_table_ddl(self, path: list[str]) -> str: ...


def resolve_clickhouse_interface(config: ConnectionConfig) -> ClickHouseInterface:
    if config.clickhouse_interface:
        return config.clickhouse_interface
    if config.port in _NATIVE_PORTS:
        return "native"
    if config.port in _HTTP_PORTS:
        return "http"
    return "native"


def _create_backend(config: ConnectionConfig) -> _ClickHouseBackend:
    if resolve_clickhouse_interface(config) == "http":
        return ClickHouseHttpDriver()
    return ClickHouseNativeDriver()


class ClickHouseDriver:
    def __init__(self) -> None:
        self._impl: _ClickHouseBackend | None = None
        self._config: ConnectionConfig | None = None

    def connect(self, config: ConnectionConfig) -> None:
        self.disconnect()
        self._impl = _create_backend(config)
        self._impl.connect(config)
        self._config = config

    def disconnect(self) -> None:
        if self._impl is not None:
            self._impl.disconnect()
            self._impl = None
        self._config = None

    def cancel_query(self) -> None:
        if self._impl is not None:
            cancel = getattr(self._impl, "cancel_query", None)
            if callable(cancel):
                cancel()

    def is_connected_with(self, config: ConnectionConfig) -> bool:
        return (
            self._config == config
            and self._impl is not None
            and self._impl.is_connected_with(config)
        )

    def set_active_database(self, database: str) -> None:
        if self._impl is not None:
            setter = getattr(self._impl, "set_active_database", None)
            if callable(setter):
                setter(database)

    def test_connection(self) -> None:
        if self._impl is None:
            raise RuntimeError("Not connected")
        self._impl.test_connection()

    def execute(self, sql: str, limit: int | None = 10_000) -> QueryResult:
        if self._impl is None:
            raise RuntimeError("Not connected")
        return self._impl.execute(sql, limit=limit)

    def list_schema_children(self, path: list[str]) -> list[SchemaNode]:
        if self._impl is None:
            raise RuntimeError("Not connected")
        return self._impl.list_schema_children(path)

    def get_table_ddl(self, path: list[str]) -> str:
        if self._impl is None:
            raise RuntimeError("Not connected")
        return self._impl.get_table_ddl(path)
