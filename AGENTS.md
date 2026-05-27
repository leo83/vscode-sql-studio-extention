# AGENTS.md

Инструкции для AI-агентов и разработчиков, работающих с репозиторием **cursor-sql-studio**.

## Назначение проекта

Расширение Cursor/VS Code для:

- написания и выполнения SQL (PostgreSQL, ClickHouse);
- просмотра объектов БД в Database Explorer;
- отображения результатов в webview (sort / filter / export);
- интеграции с Cursor Agent (rules, MCP).

## Архитектура

```
src/              TypeScript — extension host (VS Code API)
webview-ui/       React + Vite + TanStack Table — UI результатов
python/           Python backend (uv) — JSON-RPC over stdio
grammars/         TextMate grammars (SQL подсветка)
.cursor/          Rules и MCP-шаблон для Cursor
```

**Связь TS ↔ Python:** extension spawn'ит `uv run --directory python sql-studio-server`, обмен — JSON-RPC построчно через stdin/stdout.

**Пароли:** только VS Code `SecretStorage` (ключ `sql-studio.connection.{id}.password`). Не хранить пароли в `globalState`, settings, логах, MCP-ответах.

## Стек

| Часть | Технологии |
|-------|------------|
| Extension | TypeScript 5, esbuild, VS Code Extension API |
| Backend | Python 3.11+, uv, psycopg3, clickhouse-connect, sqlglot, openpyxl |
| Webview | React 18, Vite, TanStack Table v8 |
| Тесты | pytest (python), tsc (extension) |

## Структура ключевых файлов

| Путь | Назначение |
|------|------------|
| `src/extension.ts` | Точка входа, регистрация команд и explorer |
| `src/pythonClient.ts` | Spawn uv + JSON-RPC клиент |
| `src/connectionManager.ts` | Профили connections + SecretStorage |
| `src/queryRunner.ts` | Выполнение SQL и preview таблиц |
| `src/schemaExplorer/treeProvider.ts` | Database Explorer TreeView |
| `src/webview/resultsPanel.ts` | Webview panel результатов |
| `src/sqlUtils.ts` | buildPreviewSql, лимиты строк |
| `python/src/sql_studio/server.py` | JSON-RPC server |
| `python/src/sql_studio/drivers/` | postgres.py, clickhouse.py |
| `python/src/sql_studio/dialect/sqlglot_service.py` | format / split SQL |
| `package.json` | Manifest расширения, contributes, settings |

## Команды

```bash
# Полная установка
just install

# Сборка extension + webview
just build

# Тесты
just test

# Python backend (stdio, для отладки)
just uv-server

# Упаковка .vsix
just package

# Только Python
cd python && uv sync --all-groups && uv run pytest
```

## JSON-RPC методы (Python backend)

| Method | Описание |
|--------|----------|
| `health` | Healthcheck |
| `connection/test` | Проверка подключения |
| `query/execute` | Выполнить SQL |
| `schema/listChildren` | Узлы explorer (lazy) |
| `schema/getTableDDL` | DDL таблицы |
| `sql/format` | Форматирование через sqlglot |
| `export/csv`, `export/xlsx` | Экспорт результатов |

## Правила разработки

### Общие

- **Python только через uv** — зависимости в `python/pyproject.toml`, запуск через `uv run`.
- **Extension UI только TypeScript** — VS Code API не заменяется Python.
- Минимальный diff: не рефакторить несвязанный код.
- Следовать существующим паттернам имён и структуры папок.

### Безопасность

- Пароли — **только** `context.secrets.store/get/delete`.
- В MCP и agent prompts не передавать credentials.
- По умолчанию поддерживать `readOnly` flag на connection.

### SQL и диалекты

- Подсветка — TextMate grammars (`grammars/`), не писать parser с нуля.
- Parse/format/split — **sqlglot** (`read=postgres|clickhouse`).
- Preview таблицы: `sqlStudio.previewRowLimit` (default 1000).
- SQL-запросы: `sqlStudio.defaultRowLimit` (default 10000).

### Explorer

- Lazy load через `schema/listChildren`.
- Клик по table/view → `queryRunner.previewTable()` → тот же ResultsPanel, что для SQL.
- PostgreSQL: path `schemas/{schema}/{table}`; ClickHouse: `databases/{db}/{table}`.

### Webview

- Стили через CSS variables `--vscode-*`.
- Сообщения extension ↔ webview через `postMessage` (`exportCsv`, `exportXlsx`).

## Работа с Cursor Agent

### Rules

Файл `.cursor/rules/sql-agent.mdc` задаёт поведение агента на `.sql` файлах:

- учитывать dialect;
- предпочитать read-only SELECT + LIMIT;
- не светить пароли.

При добавлении agent features обновляйте этот файл.

### MCP

Шаблон в `.cursor/mcp.json` запускает `uv run sql-studio-mcp`. MCP пока stub — расширять в `python/src/sql_studio/mcp_server.py`.

Команды редактора для агента:

- `sqlStudio.askAgentExplain` — prompt в clipboard для Chat
- `sqlStudio.askAgentFix` — prompt для fix/optimize

## Тестирование изменений

Минимум перед завершением задачи:

```bash
just build
just test
```

Если менялся Python backend:

```bash
cd python && uv run pytest
echo '{"jsonrpc":"2.0","id":1,"method":"health","params":{}}' | uv run sql-studio-server
```

Если менялся explorer / query flow — проверить в Extension Development Host (F5):

1. Add Connection → Test Connection
2. Expand schema → click table → preview 1000 rows
3. `.sql` file → Cmd+Enter → results panel

## Частые ошибки

| Симптом | Решение |
|---------|---------|
| Backend not started | `uv` не в PATH → `sqlStudio.uvPath`; выполнить `cd python && uv sync` |
| Explorer пустой | Test Connection; проверить credentials |
| Webview пустой | `npm run build:webview`; проверить `webview-ui/dist/assets/` |
| Import errors в extension | `npm run lint` |

## Что не делать

- Не коммитить `node_modules/`, `python/.venv/`, `dist/`, `*.vsix`, `.env`.
- Не хранить пароли в git или plain JSON.
- Не добавлять `requirements.txt` — только `pyproject.toml` + uv.
- Не ломать stdio JSON-RPC протокол без обновления `pythonClient.ts`.

## Связанная документация

- [README.md](README.md) — установка в Cursor, первое подключение
- [python/README.md](python/README.md) — uv workflow для backend
- [CHANGELOG.md](CHANGELOG.md) — история изменений
