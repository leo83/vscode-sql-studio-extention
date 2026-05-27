"""Tests for driver registry disconnect and dialect routing."""

from unittest.mock import MagicMock, patch

from sql_studio.drivers.registry import (
    _DRIVERS,
    _SESSION_DATABASES,
    cancel_query,
    disconnect,
    get_driver,
    get_session_database,
    set_session_database,
)
from sql_studio.models import ConnectionConfig


def _postgres_config(connection_id: str = "pg-1") -> ConnectionConfig:
    return ConnectionConfig(
        id=connection_id,
        dialect="postgres",
        host="localhost",
        port=5432,
        database="app",
        username="user",
        password="secret",
    )


def _clickhouse_config(connection_id: str = "ch-1") -> ConnectionConfig:
    return ConnectionConfig(
        id=connection_id,
        dialect="clickhouse",
        host="localhost",
        port=9000,
        database="default",
        username="default",
        password="",
        clickhouse_interface="native",
    )


def setup_function() -> None:
    for driver in list(_DRIVERS.values()):
        driver.disconnect()
    _DRIVERS.clear()
    _SESSION_DATABASES.clear()


def test_disconnect_removes_driver_from_pool() -> None:
    mock_driver = MagicMock()
    _DRIVERS["x"] = mock_driver
    disconnect("x")
    assert "x" not in _DRIVERS
    mock_driver.disconnect.assert_called_once()


def test_disconnect_missing_id_is_noop() -> None:
    disconnect("missing")


def test_cancel_query_calls_driver_cancel() -> None:
    mock_driver = MagicMock()
    _DRIVERS["x"] = mock_driver
    assert cancel_query("x") is True
    mock_driver.cancel_query.assert_called_once()


def test_cancel_query_missing_id_returns_false() -> None:
    assert cancel_query("missing") is False


def test_session_database_persists_until_disconnect() -> None:
    set_session_database("c1", "robotisation")
    assert get_session_database("c1") == "robotisation"
    disconnect("c1")
    assert get_session_database("c1") is None


def test_get_driver_restores_session_database() -> None:
    from sql_studio.drivers.clickhouse import ClickHouseDriver

    set_session_database("ch-1", "robotisation")
    driver = ClickHouseDriver()
    mock_impl = MagicMock()
    mock_impl.is_connected_with.return_value = True
    driver._impl = mock_impl
    driver._config = _clickhouse_config("ch-1")
    _DRIVERS["ch-1"] = driver

    result = get_driver(_clickhouse_config("ch-1"))

    assert result is driver
    mock_impl.set_active_database.assert_called_once_with("robotisation")


@patch("sql_studio.drivers.registry.ClickHouseDriver")
@patch("sql_studio.drivers.registry.MssqlDriver")
@patch("sql_studio.drivers.registry.PostgresDriver")
def test_get_driver_creates_postgres(
    mock_pg_cls: MagicMock,
    mock_mssql_cls: MagicMock,
    mock_ch_cls: MagicMock,
) -> None:
    mock_pg = MagicMock()
    mock_pg.is_connected_with.return_value = True
    mock_pg_cls.return_value = mock_pg

    driver = get_driver(_postgres_config())
    assert driver is mock_pg
    mock_pg.connect.assert_called_once()
    mock_ch_cls.assert_not_called()
    mock_mssql_cls.assert_not_called()


@patch("sql_studio.drivers.registry.ClickHouseDriver")
@patch("sql_studio.drivers.registry.MssqlDriver")
@patch("sql_studio.drivers.registry.PostgresDriver")
def test_get_driver_creates_clickhouse(
    mock_pg_cls: MagicMock,
    mock_mssql_cls: MagicMock,
    mock_ch_cls: MagicMock,
) -> None:
    mock_ch = MagicMock()
    mock_ch.is_connected_with.return_value = True
    mock_ch_cls.return_value = mock_ch

    driver = get_driver(_clickhouse_config())
    assert driver is mock_ch
    mock_ch.connect.assert_called_once()
    mock_pg_cls.assert_not_called()
    mock_mssql_cls.assert_not_called()


def _mssql_config(connection_id: str = "mssql-1") -> ConnectionConfig:
    return ConnectionConfig(
        id=connection_id,
        dialect="mssql",
        host="localhost",
        port=1433,
        database="master",
        username="sa",
        password="secret",
    )


@patch("sql_studio.drivers.registry.ClickHouseDriver")
@patch("sql_studio.drivers.registry.MssqlDriver")
@patch("sql_studio.drivers.registry.PostgresDriver")
def test_get_driver_creates_mssql(
    mock_pg_cls: MagicMock,
    mock_mssql_cls: MagicMock,
    mock_ch_cls: MagicMock,
) -> None:
    mock_mssql = MagicMock()
    mock_mssql.is_connected_with.return_value = True
    mock_mssql_cls.return_value = mock_mssql

    driver = get_driver(_mssql_config())
    assert driver is mock_mssql
    mock_mssql.connect.assert_called_once()
    mock_pg_cls.assert_not_called()
    mock_ch_cls.assert_not_called()
