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
webview-ui/       React + Vite — UI результатов и диалога подключений
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
| Backend | Python 3.11+, uv, psycopg3, clickhouse-connect, clickhouse-driver, sqlglot, openpyxl |
| Webview | React 18, Vite, TanStack Table v8 |
| Тесты | pytest (python), tsc (extension) |

## Структура ключевых файлов

| Путь | Назначение |
|------|------------|
| `src/extension.ts` | Точка входа, регистрация команд и explorer |
| `src/pythonClient.ts` | Spawn uv + JSON-RPC клиент |
| `src/connectionManager.ts` | Профили connections + SecretStorage |
| `src/commands/createSqlQuery.ts` | Команда Create SQL Query (новый untitled-редактор) |
| `src/webview/connectionDialog.ts` | Webview-диалог создания/редактирования connection |
| `src/queryRunner.ts` | Выполнение SQL и preview таблиц; ошибки → Results panel |
| `src/schemaExplorer/treeProvider.ts` | Database Explorer TreeView (корень **Connections**) |
| `src/webview/resultsPanel.ts` | Webview panel результатов |
| `src/sqlUtils.ts` | buildPreviewSql, лимиты строк |
| `webview-ui/src/ConnectionDialog.tsx` | Форма подключения (поля по диалекту) |
| `webview-ui/src/connectionFields.ts` | Схема полей PostgreSQL / ClickHouse |
| `webview-ui/src/vscodeApi.ts` | Singleton `acquireVsCodeApi()` (один вызов на webview) |
| `webview-ui/src/QueryError.tsx` | Форматированный вывод ошибок запроса |
| `webview-ui/src/parseQueryError.ts` | Парсинг ClickHouse/Postgres error + stack trace |
| `python/src/sql_studio/server.py` | JSON-RPC server |
| `python/src/sql_studio/drivers/` | postgres, clickhouse (фасад), clickhouse_http, clickhouse_native |
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

### Документация (обязательно при важных изменениях)

При изменениях **архитектуры**, **публичного поведения**, **новых фич** или **смены зависимостей/протоколов** обновляйте в том же PR/коммите:

| Файл | Что отражать |
|------|----------------|
| **[README.md](README.md)** | Возможности для пользователя, установка, первое подключение, таблицы настроек, типичные сценарии |
| **[AGENTS.md](AGENTS.md)** | Структура файлов, стек, JSON-RPC, правила разработки, чеклисты тестирования, частые ошибки |
| **[CHANGELOG.md](CHANGELOG.md)** | Краткая запись в Unreleased/версии (если файл ведётся) |

Не откладывать документацию «на потом» — иначе агенты и разработчики расходятся с кодом.

**Примеры, когда нужно обновить README + AGENTS:**

- новый диалект БД или драйвер (как ClickHouse Native/HTTP);
- новый webview, команда или поле connection;
- смена формата JSON-RPC, путей explorer, хранения секретов;
- новые `just` / npm / uv команды.

**Можно не трогать** при чистом рефакторинге без смены поведения или мелких багфиксах.

### Безопасность

- Пароли — **только** `context.secrets.store/get/delete`.
- В MCP и agent prompts не передавать credentials.
- По умолчанию поддерживать `readOnly` flag на connection.

### SQL и диалекты

- Подсветка — TextMate grammars (`grammars/`), не писать parser с нуля.
- Parse/format/split — **sqlglot** (`read=postgres|clickhouse`).
- Preview таблицы: `sqlStudio.previewRowLimit` (default 1000).
- SQL-запросы: `sqlStudio.defaultRowLimit` (default 10000).

### Connections

- Создание/редактирование — **webview-диалог** (`ConnectionDialog`), не цепочка `showInputBox`.
- Поля задаются в `webview-ui/src/connectionFields.ts` (разный набор для postgres / clickhouse).
- Пароль: `type="password"` в UI; в профиле не хранится — только SecretStorage.
- `connection/test` из диалога: таймаут RPC ~20 с; ответ webview — `testResult`.
- ClickHouse: `clickhouse_interface` = `native` | `http`; Native → `clickhouse-driver` (9000), HTTP → `clickhouse-connect` (8123).
- Explorer: корневой узел **Connections** всегда виден; дочерние элементы — сохранённые подключения.

### Explorer

- Lazy load через `schema/listChildren`.
- Клик по table/view → `queryRunner.previewTable()` → тот же ResultsPanel, что для SQL.
- PostgreSQL: path `schemas/{schema}/{table}`; ClickHouse: `databases/{db}/{table}`.

### Webview

- Стили через CSS variables `--vscode-*`.
- **`acquireVsCodeApi()` — строго один раз** на webview: использовать `webview-ui/src/vscodeApi.ts` (`getVsCodeApi()`).
- Режимы одного бандла: `window.__SQL_STUDIO_MODE__` = `results` | `connection`.
- Сообщения extension ↔ webview: `postMessage` (`save`, `cancel`, `test`, `testResult`, `exportCsv`, `exportXlsx`).
- Ошибки `query/execute`: `QueryResult.error` → компонент `QueryError` (summary + collapsible stack trace), не plain text.

### Запросы SQL

- Команда `sqlStudio.createSqlQuery` — открывает untitled-редактор, выставляет active connection.
- `.sql` по умолчанию: `configurationDefaults` + `ensureSqlStudioLanguage()` при открытии.
- Connection: per-file (`workspaceState`) → active → quick pick; status bar `sqlStudio.selectConnection`.
- `sqlStudio.runQuery` — `findSqlStudioEditorReady()` после привязки языка.
- `split_statements` (sqlglot) отбрасывает пустые/comment-only; при ошибке парсинга — fallback без `--` строк.
- При исключении backend показывать ошибку и в notification, и в Results panel.

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
| Диалог connection без полей | Повторный `acquireVsCodeApi()` — только через `getVsCodeApi()` |
| Test connection зависает | ClickHouse: Native + 9000, не HTTP на 9000; проверить таймаут backend |
| Ошибка «No executable SQL» | В файле только комментарии; добавить `SELECT` или выделить текст запроса |
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
