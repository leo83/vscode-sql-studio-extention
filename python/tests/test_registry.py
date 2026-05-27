"""Tests for driver registry disconnect and dialect routing."""

from unittest.mock import MagicMock, patch

from sql_studio.drivers.registry import _DRIVERS, disconnect, get_driver
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


def test_disconnect_removes_driver_from_pool() -> None:
    mock_driver = MagicMock()
    _DRIVERS["x"] = mock_driver
    disconnect("x")
    assert "x" not in _DRIVERS
    mock_driver.disconnect.assert_called_once()


def test_disconnect_missing_id_is_noop() -> None:
    disconnect("missing")


@patch("sql_studio.drivers.registry.ClickHouseDriver")
@patch("sql_studio.drivers.registry.PostgresDriver")
def test_get_driver_creates_postgres(
    mock_pg_cls: MagicMock,
    mock_ch_cls: MagicMock,
) -> None:
    mock_pg = MagicMock()
    mock_pg.is_connected_with.return_value = True
    mock_pg_cls.return_value = mock_pg

    driver = get_driver(_postgres_config())
    assert driver is mock_pg
    mock_pg.connect.assert_called_once()
    mock_ch_cls.assert_not_called()


@patch("sql_studio.drivers.registry.ClickHouseDriver")
@patch("sql_studio.drivers.registry.PostgresDriver")
def test_get_driver_creates_clickhouse(
    mock_pg_cls: MagicMock,
    mock_ch_cls: MagicMock,
) -> None:
    mock_ch = MagicMock()
    mock_ch.is_connected_with.return_value = True
    mock_ch_cls.return_value = mock_ch

    driver = get_driver(_clickhouse_config())
    assert driver is mock_ch
    mock_ch.connect.assert_called_once()
    mock_pg_cls.assert_not_called()
