"""Tests for DBML schema export."""

from __future__ import annotations

from sql_studio.schema_dbml import (
    ColumnDef,
    RefDef,
    TableDef,
    build_schema_dbml_result,
    render_dbml,
    resolve_dbml_scope,
)


def test_resolve_dbml_scope_schema() -> None:
    kind, name, label = resolve_dbml_scope(["schemas", "public"])
    assert kind == "schema"
    assert name == "public"
    assert label == "public"


def test_resolve_dbml_scope_database() -> None:
    kind, name, label = resolve_dbml_scope(["databases", "analytics"])
    assert kind == "database"
    assert name == "analytics"
    assert label == "analytics"


def test_render_dbml_includes_tables_and_refs() -> None:
    tables = [
        TableDef(
            schema="public",
            name="users",
            columns=[
                ColumnDef(name="id", data_type="int", is_pk=True, nullable=False),
                ColumnDef(name="email", data_type="text"),
            ],
        ),
        TableDef(
            schema="public",
            name="orders",
            columns=[
                ColumnDef(name="id", data_type="int", is_pk=True, nullable=False),
                ColumnDef(name="user_id", data_type="int", nullable=False),
            ],
        ),
    ]
    refs = [
        RefDef(
            from_schema="public",
            from_table="orders",
            from_column="user_id",
            to_schema="public",
            to_table="users",
            to_column="id",
        )
    ]
    dbml = render_dbml("public", tables, refs, dialect="postgres")
    assert "Table public.users" in dbml
    assert "id int [pk, not null]" in dbml
    assert "user_id int [not null, ref: > public.users.id]" in dbml
    assert "Ref:" not in dbml


def test_render_dbml_sanitizes_postgres_types_with_spaces() -> None:
    tables = [
        TableDef(
            schema="public",
            name="users",
            columns=[
                ColumnDef(name="id", data_type="integer", is_pk=True),
                ColumnDef(name="email", data_type="character varying"),
                ColumnDef(name="created_at", data_type="timestamp without time zone"),
                ColumnDef(name="kind", data_type="USER-DEFINED"),
                ColumnDef(name="amount", data_type="double precision"),
                ColumnDef(name="code", data_type="varchar(255)"),
            ],
        )
    ]
    dbml = render_dbml("public", tables, [], dialect="postgres")
    assert "email character_varying" in dbml
    assert "created_at timestamp_without_time_zone" in dbml
    assert "kind USER_DEFINED" in dbml
    assert "amount double_precision" in dbml
    assert "code varchar(255)" in dbml
    assert "email character_varying // character varying" in dbml


def test_render_dbml_sanitizes_colons_in_types() -> None:
    tables = [
        TableDef(
            schema="public",
            name="items",
            columns=[
                ColumnDef(name="meta", data_type="pg_catalog:regtype"),
                ColumnDef(name="payload", data_type="json:object"),
            ],
        )
    ]
    dbml = render_dbml("public", tables, [], dialect="postgres")
    assert "meta pg_catalog_regtype" in dbml
    assert "payload json_object" in dbml
    assert "meta pg_catalog_regtype // pg_catalog:regtype" in dbml


def test_render_dbml_table_note_uses_table_settings() -> None:
    tables = [
        TableDef(
            schema="robotisation",
            name="message",
            columns=[ColumnDef(name="message_pk", data_type="UInt32", is_pk=True)],
            note="MergeTree",
        ),
        TableDef(
            schema="public",
            name="users",
            columns=[ColumnDef(name="id", data_type="int", is_pk=True)],
            note="view",
        ),
    ]
    dbml = render_dbml("robotisation", tables, [], dialect="clickhouse")
    assert "Table robotisation.message [note: 'MergeTree']" in dbml
    assert "Table public.users [note: 'view']" in dbml
    assert "Note:" not in dbml


def test_build_schema_dbml_result_counts() -> None:
    tables = [
        TableDef(
            schema="db",
            name="events",
            columns=[ColumnDef(name="id", data_type="UInt64", is_pk=True)],
        )
    ]
    result = build_schema_dbml_result("clickhouse", "db", tables, [])
    assert result.scope == "db"
    assert result.table_count == 1
    assert result.relationship_count == 0
    assert "Table db.events" in result.dbml
