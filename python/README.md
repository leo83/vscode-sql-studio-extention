# SQL Studio — Python backend (uv)

Backend запускается **только через [uv](https://docs.astral.sh/uv/)**. Зависимости и venv управляются из `pyproject.toml` + `uv.lock`.

## Структура проекта

```
python/
├── sql_studio/          # пакет backend (server, drivers, dialect, export)
├── tests/               # pytest
├── pyproject.toml       # зависимости и [tool.uv.build-backend] (flat layout)
└── uv.lock
```

Пакет собирается через **uv_build** с `module-root = ""` (flat layout, без `src/`).

## Быстрый старт

```bash
cd python
uv sync --all-groups    # создаёт .venv и ставит зависимости
uv run sql-studio-server   # JSON-RPC сервер (stdio)
uv run pytest              # тесты
```

## Команды

| Команда | Описание |
|---------|----------|
| `uv sync` | Установить runtime-зависимости |
| `uv sync --all-groups` | + dev (pytest) |
| `uv add <pkg>` | Добавить зависимость |
| `uv run sql-studio-server` | Запустить backend |
| `uv run sql-studio-mcp` | MCP stub (фаза 3) |
| `uv run pytest` | Тесты |

## Как extension запускает backend

TypeScript-клиент вызывает:

```bash
uv run --directory <extension>/python sql-studio-server
```

Путь к `uv` настраивается в Cursor/VS Code: **SQL Studio › Uv Path** (`sqlStudio.uvPath`, по умолчанию `uv`).

## Требования

- Python 3.11+ (uv подберёт интерпретатор при `uv sync`)
- uv установлен и доступен в `PATH`

Установка uv:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Зависимости по диалектам

| Диалект | Python-пакет | Системная зависимость |
|---------|--------------|------------------------|
| PostgreSQL | `psycopg[binary]` | — |
| ClickHouse HTTP | `clickhouse-connect` | — |
| ClickHouse Native | `clickhouse-driver` | — |
| Microsoft SQL Server | `pyodbc` | **ODBC Driver for SQL Server** на ОС |
| MySQL | `pymysql` | — |
| SQLite | stdlib `sqlite3` | — |

`pyodbc` ставится автоматически при `uv sync`. **ODBC Driver for SQL Server** в venv не попадает — его нужно установить отдельно на машине пользователя.

### Microsoft SQL Server (ODBC)

Драйвер `MssqlDriver` (`python/sql_studio/drivers/mssql.py`) подключается через **pyodbc** и перебирает ODBC-драйверы:

1. ODBC Driver 18 for SQL Server
2. ODBC Driver 17 for SQL Server
3. ODBC Driver 13 for SQL Server
4. SQL Server (legacy)

Если ни один не найден, `connection/test` и `query/execute` вернут ошибку с просьбой установить драйвер.

**macOS**

```bash
brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release
brew install msodbcsql18
odbcinst -q -d   # проверка
```

**Windows / Linux** — см. [Microsoft ODBC Driver for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server).

Строка подключения формируется с параметрами:

- `Encrypt=yes/no` — из флага SSL в профиле connection
- `TrustServerCertificate=yes` — при отключённом SSL (типично для локального dev)
- `ApplicationIntent=ReadOnly` — при read-only connection

Parse/format/split для T-SQL: **sqlglot** с `read=tsql` (`dialect_read("mssql")`).

## Драйверы (файлы)

Пути относительно `python/sql_studio/`:

| Файл | СУБД |
|------|------|
| `drivers/postgres.py` | PostgreSQL |
| `drivers/clickhouse.py` | ClickHouse (фасад) |
| `drivers/clickhouse_http.py` | ClickHouse HTTP |
| `drivers/clickhouse_native.py` | ClickHouse Native TCP |
| `drivers/mssql.py` | Microsoft SQL Server |
| `drivers/mysql.py` | MySQL |
| `drivers/sqlite.py` | SQLite (local file) |
| `drivers/registry.py` | пул соединений и фабрика драйверов |
| `schema_dbml.py` | DBML и Mermaid ER для schema/database |
