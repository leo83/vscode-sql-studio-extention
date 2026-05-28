"""Tests for DBML / Mermaid schema export."""

from __future__ import annotations

from sql_studio.schema_dbml import (
    ColumnDef,
    RefDef,
    TableDef,
    build_schema_dbml_result,
    render_dbml,
    render_mermaid_er,
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
    assert "Ref: public.orders.user_id > public.users.id" in dbml


def test_render_mermaid_sanitizes_special_types_and_names() -> None:
    tables = [
        TableDef(
            schema="robotisation",
            name="events",
            columns=[
                ColumnDef(name="list.conversation_intent", data_type="Nullable(UInt32)"),
            ],
        )
    ]
    mermaid = render_mermaid_er("robotisation", tables, [])
    assert "list_conversation_intent Nullable_UInt32" in mermaid
    assert "Nullable(UInt32)" not in mermaid


def test_render_mermaid_sanitizes_postgres_character_varying() -> None:
    tables = [
        TableDef(
            schema="public",
            name="schema_version",
            columns=[
                ColumnDef(
                    name="version_num",
                    data_type="character varying",
                    is_pk=True,
                ),
            ],
        )
    ]
    mermaid = render_mermaid_er("public", tables, [])
    assert "version_num character_varying PK" in mermaid
    assert 'public_schema_version["public.schema_version"]' in mermaid
    assert "character varying" not in mermaid


def test_render_mermaid_orders_parent_tables_before_children() -> None:
    tables = [
        TableDef(
            schema="public",
            name="orders",
            columns=[
                ColumnDef(name="id", data_type="int", is_pk=True),
                ColumnDef(name="user_id", data_type="int"),
            ],
        ),
        TableDef(
            schema="public",
            name="users",
            columns=[ColumnDef(name="id", data_type="int", is_pk=True)],
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
    mermaid = render_mermaid_er("public", tables, refs)
    users_pos = mermaid.index('public_users["public.users"] {')
    orders_pos = mermaid.index('public_orders["public.orders"] {')
    assert users_pos != -1
    assert orders_pos != -1
    assert users_pos < orders_pos
    assert "direction TB" in mermaid
    assert "user_id int" in mermaid


def test_render_mermaid_uses_schema_dot_table_alias() -> None:
    tables = [
        TableDef(
            schema="public",
            name="message",
            columns=[ColumnDef(name="message_pk", data_type="integer", is_pk=True)],
        )
    ]
    mermaid = render_mermaid_er("public", tables, [])
    assert 'public_message["public.message"]' in mermaid
    assert "message_pk integer PK" in mermaid


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
    assert "erDiagram" in result.mermaid
    assert "db_events" in result.mermaid
