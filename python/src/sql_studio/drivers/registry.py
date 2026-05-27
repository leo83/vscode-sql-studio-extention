"""Connection pool and driver factory."""

from __future__ import annotations

from sql_studio.drivers.clickhouse import ClickHouseDriver
from sql_studio.drivers.postgres import PostgresDriver
from sql_studio.models import ConnectionConfig

_DRIVERS: dict[str, PostgresDriver | ClickHouseDriver] = {}


def get_driver(config: ConnectionConfig) -> PostgresDriver | ClickHouseDriver:
    existing = _DRIVERS.get(config.id)
    if existing is not None and isinstance(existing, _driver_class(config)):
        existing.connect(config)
        return existing
    if existing is not None:
        existing.disconnect()
    driver = _create_driver(config)
    driver.connect(config)
    _DRIVERS[config.id] = driver
    return driver


def disconnect(connection_id: str) -> None:
    driver = _DRIVERS.pop(connection_id, None)
    if driver is not None:
        driver.disconnect()


def _driver_class(config: ConnectionConfig) -> type:
    if config.dialect == "postgres":
        return PostgresDriver
    return ClickHouseDriver


def _create_driver(config: ConnectionConfig) -> PostgresDriver | ClickHouseDriver:
    if config.dialect == "postgres":
        return PostgresDriver()
    return ClickHouseDriver()


def test_connection(config: ConnectionConfig) -> None:
    """Test connectivity without caching the driver in the pool."""
    driver = _create_driver(config)
    try:
        driver.connect(config)
        driver.test_connection()
    finally:
        driver.disconnect()
