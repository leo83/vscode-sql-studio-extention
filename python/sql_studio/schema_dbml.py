"""Collect schema metadata and render DBML / Mermaid ER diagrams."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Protocol

from sql_studio.models import Dialect, SchemaDbmlResult


@dataclass
class ColumnDef:
    name: str
    data_type: str
    nullable: bool = True
    is_pk: bool = False
    note: str | None = None


@dataclass
class TableDef:
    schema: str
    name: str
    columns: list[ColumnDef] = field(default_factory=list)
    note: str | None = None

    @property
    def qualified(self) -> str:
        if self.schema:
            return f"{self.schema}.{self.name}"
        return self.name


@dataclass
class RefDef:
    from_schema: str
    from_table: str
    from_column: str
    to_schema: str
    to_table: str
    to_column: str

    @property
    def from_qualified(self) -> str:
        if self.from_schema:
            return f"{self.from_schema}.{self.from_table}"
        return self.from_table

    @property
    def to_qualified(self) -> str:
        if self.to_schema:
            return f"{self.to_schema}.{self.to_table}"
        return self.to_table


class _RowCursor(Protocol):
    def fetchall(self) -> list[Any]: ...


class _QueryCursor(Protocol):
    def execute(self, sql: str, params: Any = None) -> _RowCursor: ...


def resolve_dbml_scope(path: list[str]) -> tuple[str, str, str]:
    """Return (scope_kind, scope_name, scope_label) from explorer path."""
    if len(path) == 2 and path[0] == "schemas":
        return "schema", path[1], path[1]
    if len(path) == 2 and path[0] == "databases":
        return "database", path[1], path[1]
    raise ValueError(
        "DBML is available for a schema or database node. "
        "Right-click a schema (PostgreSQL) or database (ClickHouse)."
    )


def _dbml_ident(name: str) -> str:
    if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
        return name
    escaped = name.replace('"', '""')
    return f'"{escaped}"'


def _dbml_table_name(table: TableDef) -> str:
    if table.schema:
        return f"{_dbml_ident(table.schema)}.{_dbml_ident(table.name)}"
    return _dbml_ident(table.name)


def render_dbml(
    scope_label: str,
    tables: list[TableDef],
    refs: list[RefDef],
    *,
    dialect: Dialect,
) -> str:
    lines = [
        f"// SQL Studio — {dialect} — scope: {scope_label}",
        f"// Tables: {len(tables)}, relationships: {len(refs)}",
        "",
    ]
    for table in sorted(tables, key=lambda t: t.qualified):
        lines.append(f"Table {_dbml_table_name(table)} {{")
        if table.note:
            lines.append(f"  Note: '{_escape_dbml_note(table.note)}'")
        for col in table.columns:
            settings: list[str] = []
            if col.is_pk:
                settings.append("pk")
            if not col.nullable:
                settings.append("not null")
            setting = f" [{', '.join(settings)}]" if settings else ""
            note = f" // {_escape_dbml_note(col.note)}" if col.note else ""
            lines.append(
                f"  {_dbml_ident(col.name)} {col.data_type}{setting}{note}"
            )
        lines.append("}")
        lines.append("")

    for ref in refs:
        from_name = _dbml_table_name(
            TableDef(ref.from_schema, ref.from_table, [])
        )
        to_name = _dbml_table_name(TableDef(ref.to_schema, ref.to_table, []))
        lines.append(
            "Ref: "
            f"{from_name}.{_dbml_ident(ref.from_column)} "
            f"> {to_name}.{_dbml_ident(ref.to_column)}"
        )

    return "\n".join(lines).rstrip() + "\n"


def _escape_dbml_note(value: str) -> str:
    return value.replace("'", "\\'")


def _mermaid_id(qualified: str) -> str:
    return _mermaid_token(qualified, fallback="entity")


def _mermaid_token(value: str, *, fallback: str = "field") -> str:
    """Single Mermaid ER identifier (entity names). No dots or parentheses."""
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", value)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        return fallback
    if cleaned[0].isdigit():
        return f"f_{cleaned}"
    return cleaned


_MERMAID_ATTRIBUTE_KEYS = frozenset({"pk", "fk", "uk"})


def _mermaid_attribute_part(value: str, *, fallback: str) -> str:
    """Mermaid ER attribute type or name — single token (no spaces). PK/FK/UK are reserved."""
    text = value.strip() or fallback
    token = _mermaid_token(text, fallback=fallback)
    if token.lower() in _MERMAID_ATTRIBUTE_KEYS:
        return f"col_{token}"
    return token


def _mermaid_relationship_label(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def render_mermaid_er(
    scope_label: str,
    tables: list[TableDef],
    refs: list[RefDef],
) -> str:
    lines = ["erDiagram", f"  %% scope: {scope_label}"]
    for table in sorted(tables, key=lambda t: t.qualified):
        entity = _mermaid_id(table.qualified)
        lines.append(f"  {entity} {{")
        seen_attrs: set[str] = set()
        for col in table.columns:
            attr_type = _mermaid_attribute_part(col.data_type, fallback="type")
            attr_name = _mermaid_attribute_part(col.name, fallback="column")
            dedupe_key = attr_name
            if dedupe_key in seen_attrs:
                suffix = 2
                base = dedupe_key
                while dedupe_key in seen_attrs:
                    dedupe_key = f"{base}_{suffix}"
                    suffix += 1
                attr_name = _mermaid_attribute_part(dedupe_key, fallback="column")
            seen_attrs.add(dedupe_key)
            pk = " PK" if col.is_pk else ""
            lines.append(f"    {attr_type} {attr_name}{pk}")
        lines.append("  }")
    for ref in refs:
        left = _mermaid_id(ref.from_qualified)
        right = _mermaid_id(ref.to_qualified)
        label = _mermaid_relationship_label(ref.from_column)
        lines.append(f'  {right} ||--o{{ {left} : "{label}"')
    return "\n".join(lines)


def build_schema_dbml_result(
    dialect: Dialect,
    scope_label: str,
    tables: list[TableDef],
    refs: list[RefDef],
) -> SchemaDbmlResult:
    dbml = render_dbml(scope_label, tables, refs, dialect=dialect)
    mermaid = render_mermaid_er(scope_label, tables, refs)
    return SchemaDbmlResult(
        scope=scope_label,
        dbml=dbml,
        mermaid=mermaid,
        table_count=len(tables),
        relationship_count=len(refs),
    )


def collect_postgres_schema(
    cursor: _QueryCursor, schema: str
) -> tuple[list[TableDef], list[RefDef]]:
    cursor.execute(
        """
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = %s
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_name
        """,
        (schema,),
    )
    table_rows = cursor.fetchall()
    tables: list[TableDef] = []
    for row in table_rows:
        table_name = row["table_name"]
        note = "view" if "VIEW" in str(row["table_type"]) else None
        cursor.execute(
            """
            SELECT c.column_name, c.data_type, c.is_nullable,
                   COALESCE(
                       (SELECT true FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu
                          ON tc.constraint_name = kcu.constraint_name
                         AND tc.table_schema = kcu.table_schema
                        WHERE tc.constraint_type = 'PRIMARY KEY'
                          AND tc.table_schema = %s AND tc.table_name = %s
                          AND kcu.column_name = c.column_name
                        LIMIT 1), false
                   ) AS is_pk
            FROM information_schema.columns c
            WHERE c.table_schema = %s AND c.table_name = %s
            ORDER BY c.ordinal_position
            """,
            (schema, table_name, schema, table_name),
        )
        columns = [
            ColumnDef(
                name=col["column_name"],
                data_type=col["data_type"],
                nullable=col["is_nullable"] == "YES",
                is_pk=bool(col["is_pk"]),
            )
            for col in cursor.fetchall()
        ]
        tables.append(TableDef(schema=schema, name=table_name, columns=columns, note=note))

    cursor.execute(
        """
        SELECT
            tc.table_schema AS from_schema,
            tc.table_name AS from_table,
            kcu.column_name AS from_column,
            ccu.table_schema AS to_schema,
            ccu.table_name AS to_table,
            ccu.column_name AS to_column
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
         AND tc.table_schema = rc.constraint_schema
        JOIN information_schema.key_column_usage AS ccu
          ON rc.unique_constraint_name = ccu.constraint_name
         AND rc.unique_constraint_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = %s
        ORDER BY tc.table_name, kcu.ordinal_position
        """,
        (schema,),
    )
    refs = [
        RefDef(
            from_schema=row["from_schema"],
            from_table=row["from_table"],
            from_column=row["from_column"],
            to_schema=row["to_schema"],
            to_table=row["to_table"],
            to_column=row["to_column"],
        )
        for row in cursor.fetchall()
    ]
    return tables, refs


def collect_mssql_schema(
    cursor: _QueryCursor, schema: str
) -> tuple[list[TableDef], list[RefDef]]:
    cursor.execute(
        """
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = ?
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_name
        """,
        (schema,),
    )
    tables: list[TableDef] = []
    for row in cursor.fetchall():
        table_name = row[0]
        note = "view" if "VIEW" in str(row[1]).upper() else None
        cursor.execute(
            """
            SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE,
                   CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_pk
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                  ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                 AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) pk
              ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA
             AND pk.TABLE_NAME = c.TABLE_NAME
             AND pk.COLUMN_NAME = c.COLUMN_NAME
            WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
            ORDER BY c.ORDINAL_POSITION
            """,
            (schema, table_name),
        )
        columns = [
            ColumnDef(
                name=col[0],
                data_type=col[1],
                nullable=str(col[2]).upper() == "YES",
                is_pk=bool(col[3]),
            )
            for col in cursor.fetchall()
        ]
        tables.append(TableDef(schema=schema, name=table_name, columns=columns, note=note))

    cursor.execute(
        """
        SELECT
            fk.TABLE_SCHEMA AS from_schema,
            fk.TABLE_NAME AS from_table,
            cu.COLUMN_NAME AS from_column,
            pk.TABLE_SCHEMA AS to_schema,
            pk.TABLE_NAME AS to_table,
            pt.COLUMN_NAME AS to_column
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS fk
          ON rc.CONSTRAINT_NAME = fk.CONSTRAINT_NAME
         AND rc.CONSTRAINT_SCHEMA = fk.CONSTRAINT_SCHEMA
        JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS pk
          ON rc.UNIQUE_CONSTRAINT_NAME = pk.CONSTRAINT_NAME
         AND rc.UNIQUE_CONSTRAINT_SCHEMA = pk.CONSTRAINT_SCHEMA
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE cu
          ON fk.CONSTRAINT_NAME = cu.CONSTRAINT_NAME
         AND fk.TABLE_SCHEMA = cu.TABLE_SCHEMA
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pt
          ON pk.CONSTRAINT_NAME = pt.CONSTRAINT_NAME
         AND pk.TABLE_SCHEMA = pt.TABLE_SCHEMA
         AND cu.ORDINAL_POSITION = pt.ORDINAL_POSITION
        WHERE fk.CONSTRAINT_TYPE = 'FOREIGN KEY'
          AND fk.TABLE_SCHEMA = ?
        ORDER BY fk.TABLE_NAME, cu.ORDINAL_POSITION
        """,
        (schema,),
    )
    refs = [
        RefDef(
            from_schema=row[0],
            from_table=row[1],
            from_column=row[2],
            to_schema=row[3],
            to_table=row[4],
            to_column=row[5],
        )
        for row in cursor.fetchall()
    ]
    return tables, refs


def collect_mysql_schema(
    cursor: _QueryCursor, schema: str
) -> tuple[list[TableDef], list[RefDef]]:
    cursor.execute(
        """
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = %s
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_name
        """,
        (schema,),
    )
    tables: list[TableDef] = []
    for row in cursor.fetchall():
        table_name = row["table_name"]
        note = "view" if "VIEW" in str(row["table_type"]).upper() else None
        cursor.execute(
            """
            SELECT c.column_name, c.data_type, c.is_nullable,
                   CASE WHEN k.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT table_schema, table_name, column_name
                FROM information_schema.key_column_usage
                WHERE constraint_name = 'PRIMARY'
                  AND table_schema = %s
            ) k
              ON k.table_schema = c.table_schema
             AND k.table_name = c.table_name
             AND k.column_name = c.column_name
            WHERE c.table_schema = %s AND c.table_name = %s
            ORDER BY c.ordinal_position
            """,
            (schema, schema, table_name),
        )
        columns = [
            ColumnDef(
                name=col["column_name"],
                data_type=col["data_type"],
                nullable=col["is_nullable"] == "YES",
                is_pk=bool(col["is_pk"]),
            )
            for col in cursor.fetchall()
        ]
        tables.append(TableDef(schema=schema, name=table_name, columns=columns, note=note))

    cursor.execute(
        """
        SELECT
            kcu.table_schema AS from_schema,
            kcu.table_name AS from_table,
            kcu.column_name AS from_column,
            kcu.referenced_table_schema AS to_schema,
            kcu.referenced_table_name AS to_table,
            kcu.referenced_column_name AS to_column
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.table_schema = %s
          AND kcu.referenced_table_name IS NOT NULL
        ORDER BY kcu.table_name, kcu.ordinal_position
        """,
        (schema,),
    )
    refs = [
        RefDef(
            from_schema=row["from_schema"],
            from_table=row["from_table"],
            from_column=row["from_column"],
            to_schema=row["to_schema"] or schema,
            to_table=row["to_table"],
            to_column=row["to_column"],
        )
        for row in cursor.fetchall()
    ]
    return tables, refs


def collect_sqlite_schema(
    conn: Any, schema: str
) -> tuple[list[TableDef], list[RefDef]]:
    del schema
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT name, type
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    )
    tables: list[TableDef] = []
    refs: list[RefDef] = []
    for row in cursor.fetchall():
        table_name = row[0]
        note = "view" if row[1] == "view" else None
        cursor.execute(f'PRAGMA table_info("{table_name}")')
        columns = [
            ColumnDef(
                name=col[1],
                data_type=col[2] or "TEXT",
                nullable=not bool(col[3]),
                is_pk=bool(col[5]),
            )
            for col in cursor.fetchall()
        ]
        tables.append(TableDef(schema="main", name=table_name, columns=columns, note=note))
        cursor.execute(f'PRAGMA foreign_key_list("{table_name}")')
        for fk in cursor.fetchall():
            refs.append(
                RefDef(
                    from_schema="main",
                    from_table=table_name,
                    from_column=fk[3],
                    to_schema="main",
                    to_table=fk[2],
                    to_column=fk[4],
                )
            )
    return tables, refs


class _ClickHouseClient(Protocol):
    def query(
        self, sql: str, parameters: dict[str, str] | None = None
    ) -> Any: ...


def collect_clickhouse_database(
    client: _ClickHouseClient, database: str
) -> tuple[list[TableDef], list[RefDef]]:
    rows = client.query(
        """
        SELECT table, name, type
        FROM system.columns
        WHERE database = {db:String}
        ORDER BY table, position
        """,
        parameters={"db": database},
    ).result_rows or []
    by_table: dict[str, list[ColumnDef]] = {}
    for table, name, col_type in rows:
        by_table.setdefault(str(table), []).append(
            ColumnDef(name=str(name), data_type=str(col_type))
        )
    table_rows = client.query(
        """
        SELECT name, engine
        FROM system.tables
        WHERE database = {db:String}
        ORDER BY name
        """,
        parameters={"db": database},
    ).result_rows or []
    engines = {str(r[0]): str(r[1]) if len(r) > 1 else "" for r in table_rows}
    tables = [
        TableDef(
            schema=database,
            name=table,
            columns=by_table.get(table, []),
            note=engines.get(table) or None,
        )
        for table in sorted(by_table.keys())
    ]
    return tables, []


def get_schema_dbml_for_path(
    dialect: Dialect,
    path: list[str],
    *,
    postgres_cursor: _QueryCursor | None = None,
    mssql_cursor: _QueryCursor | None = None,
    mysql_cursor: _QueryCursor | None = None,
    sqlite_conn: Any | None = None,
    clickhouse_client: _ClickHouseClient | None = None,
) -> SchemaDbmlResult:
    _scope_kind, scope_name, scope_label = resolve_dbml_scope(path)

    if dialect == "postgres":
        if postgres_cursor is None:
            raise RuntimeError("Not connected")
        tables, refs = collect_postgres_schema(postgres_cursor, scope_name)
    elif dialect == "mssql":
        if mssql_cursor is None:
            raise RuntimeError("Not connected")
        tables, refs = collect_mssql_schema(mssql_cursor, scope_name)
    elif dialect == "mysql":
        if mysql_cursor is None:
            raise RuntimeError("Not connected")
        tables, refs = collect_mysql_schema(mysql_cursor, scope_name)
    elif dialect == "sqlite":
        if sqlite_conn is None:
            raise RuntimeError("Not connected")
        tables, refs = collect_sqlite_schema(sqlite_conn, scope_name)
    elif dialect == "clickhouse":
        if clickhouse_client is None:
            raise RuntimeError("Not connected")
        tables, refs = collect_clickhouse_database(clickhouse_client, scope_name)
    else:
        raise ValueError(f"Unsupported dialect: {dialect}")

    return build_schema_dbml_result(dialect, scope_label, tables, refs)
