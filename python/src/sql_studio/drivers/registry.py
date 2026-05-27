"""Connection pool and driver factory."""

from __future__ import annotations

from sql_studio.drivers.clickhouse import ClickHouseDriver
from sql_studio.drivers.mssql import MssqlDriver
from sql_studio.drivers.postgres import PostgresDriver
from sql_studio.models import ConnectionConfig

_DRIVERS: dict[str, PostgresDriver | ClickHouseDriver | MssqlDriver] = {}
_SESSION_DATABASES: dict[str, str] = {}


def get_session_database(connection_id: str) -> str | None:
    return _SESSION_DATABASES.get(connection_id)


def set_session_database(connection_id: str, database: str) -> None:
    _SESSION_DATABASES[connection_id] = database


def clear_session_database(connection_id: str) -> None:
    _SESSION_DATABASES.pop(connection_id, None)


def get_driver(config: ConnectionConfig) -> PostgresDriver | ClickHouseDriver | MssqlDriver:
    existing = _DRIVERS.get(config.id)
    if existing is not None and isinstance(existing, _driver_class(config)):
        if existing.is_connected_with(config):
            _restore_session_database(existing, config.id)
            return existing
        existing.disconnect()
    elif existing is not None:
        existing.disconnect()
    driver = (
        existing
        if existing is not None and isinstance(existing, _driver_class(config))
        else _create_driver(config)
    )
    driver.connect(config)
    _restore_session_database(driver, config.id)
    _DRIVERS[config.id] = driver
    return driver


def _restore_session_database(
    driver: PostgresDriver | ClickHouseDriver | MssqlDriver, connection_id: str
) -> None:
    database = get_session_database(connection_id)
    if not database:
        return
    setter = getattr(driver, "set_active_database", None)
    if callable(setter):
        setter(database)


def disconnect(connection_id: str) -> None:
    clear_session_database(connection_id)
    driver = _DRIVERS.pop(connection_id, None)
    if driver is not None:
        driver.disconnect()


def cancel_query(connection_id: str) -> bool:
    driver = _DRIVERS.get(connection_id)
    if driver is None:
        return False
    cancel = getattr(driver, "cancel_query", None)
    if not callable(cancel):
        return False
    cancel()
    return True


def _driver_class(config: ConnectionConfig) -> type:
    if config.dialect == "postgres":
        return PostgresDriver
    if config.dialect == "mssql":
        return MssqlDriver
    return ClickHouseDriver


def _create_driver(
    config: ConnectionConfig,
) -> PostgresDriver | ClickHouseDriver | MssqlDriver:
    if config.dialect == "postgres":
        return PostgresDriver()
    if config.dialect == "mssql":
        return MssqlDriver()
    return ClickHouseDriver()


def test_connection(config: ConnectionConfig) -> None:
    """Test connectivity without caching the driver in the pool."""
    driver = _create_driver(config)
    try:
        driver.connect(config)
        driver.test_connection()
    finally:
        driver.disconnect()
