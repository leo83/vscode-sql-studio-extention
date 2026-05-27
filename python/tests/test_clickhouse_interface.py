"""Tests for ClickHouse interface resolution."""

from sql_studio.drivers.clickhouse import resolve_clickhouse_interface
from sql_studio.models import ConnectionConfig


def _config(port: int, interface: str | None = None) -> ConnectionConfig:
    return ConnectionConfig(
        id="t",
        dialect="clickhouse",
        host="localhost",
        port=port,
        database="default",
        username="default",
        clickhouse_interface=interface,  # type: ignore[arg-type]
    )


def test_resolve_explicit_native() -> None:
    assert resolve_clickhouse_interface(_config(8123, "native")) == "native"


def test_resolve_port_9000_defaults_native() -> None:
    assert resolve_clickhouse_interface(_config(9000)) == "native"


def test_resolve_port_8123_defaults_http() -> None:
    assert resolve_clickhouse_interface(_config(8123)) == "http"
