# AGENTS.md

Инструкции для AI-агентов и разработчиков, работающих с репозиторием **cursor-sql-studio**.

## Назначение проекта

Расширение Cursor/VS Code для:

- написания и выполнения SQL (PostgreSQL, ClickHouse, Microsoft SQL Server, MySQL, SQLite);
- просмотра объектов БД в Database Explorer;
- отображения результатов в webview (sort / filter / export);
- интеграции с Cursor Agent (rules, MCP).

## Архитектура

```
src/                  TypeScript — extension host (VS Code API)
webview-ui/           React + Vite — UI результатов и диалога подключений
python/
  sql_studio/         Python package — JSON-RPC server, drivers, export
  tests/              pytest
grammars/             TextMate grammars (SQL подсветка)
.cursor/              Rules и MCP-шаблон для Cursor
```

**Связь TS ↔ Python:** extension spawn'ит `uv run --directory python sql-studio-server`, обмен — JSON-RPC построчно через stdin/stdout.

**Пароли:** только VS Code `SecretStorage` (ключ `sql-studio.connection.{id}.password`). Не хранить пароли в `globalState`, settings, логах, MCP-ответах.

## Стек

| Часть | Технологии |
|-------|------------|
| Extension | TypeScript 5, esbuild, VS Code Extension API |
| Backend | Python 3.11+, uv, psycopg3, clickhouse-connect, clickhouse-driver, pyodbc, pymysql, sqlglot, openpyxl |
| Webview | React 18, Vite, TanStack Table v8 |
| Тесты | pytest (python), vitest (webview-ui), tsc (extension) |

## Структура ключевых файлов

| Путь | Назначение |
|------|------------|
| `src/extension.ts` | Точка входа, регистрация команд и explorer |
| `src/pythonClient.ts` | Spawn uv + JSON-RPC клиент |
| `src/connectionManager.ts` | Профили connections + SecretStorage + tags + lazy connect |
| `src/connectionTags.ts` | Теги connections: цвета, pill SVG, Explorer description |
| `src/commands/createSqlQuery.ts` | Команда Create SQL Query (новый untitled-редактор) |
| `src/webview/connectionDialog.ts` | Webview-диалог создания/редактирования connection |
| `src/queryRunner.ts` | Выполнение SQL и preview таблиц; ошибки → Results panel; cancel query |
| `src/schemaExplorer/treeProvider.ts` | Database Explorer TreeView (корень **Connections**) |
| `src/schemaExplorer/objectNameFilter.ts` | Фильтр имён объектов schema/database |
| `src/commands/schemaCommands.ts` | ER diagram + DBML из контекстного меню schema/database |
| `src/webview/erDiagramPanel.ts` | Webview panel ER-диаграммы (DBML renderer) |
| `python/sql_studio/schema_dbml.py` | Сбор метаданных схемы, генерация DBML |
| `src/webview/resultsPanel.ts` | Webview panel результатов |
| `src/sqlUtils.ts` | buildPreviewSql, лимиты строк |
| `webview-ui/src/ConnectionDialog.tsx` | Форма подключения (поля по диалекту, TagEditor) |
| `webview-ui/src/connectionFields.ts` | Схема полей postgres / clickhouse / mssql / mysql / sqlite |
| `webview-ui/src/TagEditor.tsx` | Редактор тегов в диалоге подключения |
| `webview-ui/src/tagPill.tsx` | SVG pill для тегов (shared с extension) |
| `webview-ui/src/vscodeApi.ts` | Singleton `acquireVsCodeApi()` (один вызов на webview) |
| `webview-ui/src/QueryError.tsx` | Форматированный вывод ошибок запроса |
| `webview-ui/src/parseQueryError.ts` | Парсинг ClickHouse/Postgres error + stack trace |
| `webview-ui/src/ExplainPlanView.tsx` | Execution plan: Tree / Table / Raw, search, copy |
| `webview-ui/src/PlanTreeView.tsx` | Collapsible plan tree с badges и метриками |
| `webview-ui/src/PlanTableView.tsx` | Flattened plan table |
| `webview-ui/src/planTreeUtils.ts` | flatten/search/count для plan tree |
| `webview-ui/src/ResultsTable.tsx` | TanStack Table: sort, filter, resize columns, copy |
| `webview-ui/src/ResultsChart.tsx` | ECharts: конфигурация и рендер графиков |
| `webview-ui/src/chartConfig.ts` | Типы графиков, агрегация, horizontal scroll bar, ECharts option builder |
| `webview-ui/src/pieChartGestures.ts` | Pinch-zoom и scroll легенды для pie chart |
| `webview-ui/src/ErDiagramView.tsx` | ER diagram webview (DBML render + toolbar) |
| `webview-ui/src/erDiagramGestures.ts` | Pan, zoom, autofit для ER diagram |
| `python/sql_studio/server.py` | JSON-RPC server |
| `python/sql_studio/drivers/` | postgres, clickhouse (фасад), clickhouse_http, clickhouse_native, mssql, mysql, sqlite |
| `python/sql_studio/dialect/sqlglot_service.py` | format / split SQL |
| `python/sql_studio/dialect/explain.py` | EXPLAIN SQL builders, `attach_plan()` |
| `python/sql_studio/dialect/plan_parsers/` | structured EXPLAIN → `PlanNode` |
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
| `query/explain` | Structured EXPLAIN для SELECT/WITH → `plan_tree`, `plan_text`, `plan_format` |
| `schema/listChildren` | Узлы explorer (lazy) |
| `schema/getTableDDL` | DDL таблицы |
| `schema/getDbml` | DBML ER для схемы/базы (контекстное меню explorer) |
| `sql/format` | Форматирование через sqlglot |
| `sql/checkUnboundedSelect` | Предупреждение о больших таблицах в unbounded SELECT |
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
| **[README.md](README.md)** | User-facing docs (English): features, install, settings, Marketplace |
| **[README.ru.md](README.ru.md)** | Russian user docs (Cursor install details, `.vsix`) |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Contributor setup, PR checklist |
| **[SECURITY.md](SECURITY.md)** | Vulnerability reporting, security model |
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
- Parse/format/split — **sqlglot** (`read=postgres|clickhouse|tsql|mysql|sqlite` по диалекту).
- Preview таблицы: `sqlStudio.previewRowLimit` (default 1000). MSSQL: `SELECT TOP N`.
- SQL-запросы: `sqlStudio.defaultRowLimit` (default 10000).
- Unbounded SELECT warning: `sqlStudio.warnOnLargeUnboundedSelect` (default true), порог `sqlStudio.largeTableRowThreshold` (default 5000).
- PostgreSQL EXPLAIN ANALYZE: `sqlStudio.explainAnalyze` (default false).
- Structured execution plan (`query/explain`): Postgres `FORMAT JSON`, ClickHouse `json=1`, MySQL `FORMAT=JSON`, SQLite `EXPLAIN QUERY PLAN`, MSSQL `SHOWPLAN_XML`; fallback — text tree по отступам.
- `StatementResult`: `plan_tree`, `plan_text`, `plan_format` (`tree` | `table` | `text`).
- Акценты webview: `sqlStudio.accentColor`, `sqlStudio.chartAccentColors`.

### Connections

- Создание/редактирование — **webview-диалог** (`ConnectionDialog`), не цепочка `showInputBox`.
- Поля задаются в `webview-ui/src/connectionFields.ts` (разный набор для postgres / clickhouse / mssql / mysql / sqlite).
- **Теги** — массив `{ name, color }` в профиле connection; цвет — palette id или hex; UI: `TagEditor` в диалоге, команда `sqlStudio.manageConnectionTags`.
- Пароль: `type="password"` в UI; в профиле не хранится — только SecretStorage.
- `connection/test` из диалога: таймаут RPC ~20 с; ответ webview — `testResult`.
- ClickHouse: `clickhouse_interface` = `native` | `http`; Native → `clickhouse-driver` (9000), HTTP → `clickhouse-connect` (8123).
- MSSQL: `pyodbc` + **системный ODBC Driver for SQL Server** (18/17/13); без ODBC на ОС подключение не работает.
- Explorer: корневой узел **Connections** всегда виден; дочерние элементы — сохранённые подключения.

### Explorer

- Lazy load через `schema/listChildren`.
- **Фильтр имён** на узлах schema/database: `objectNameFilter` в treeProvider; inline-команды `filterSchemaObjects`, `editSchemaObjectFilter`, `clearSchemaObjectFilter`.
- Клик по table/view → `queryRunner.previewTable()` → тот же ResultsPanel, что для SQL.
- PostgreSQL / MSSQL / MySQL: path `schemas/{schema}/{table}`; ClickHouse: `databases/{db}/{table}`; SQLite: file as database.
- ER diagram: `showSchemaDiagram` → `ErDiagramPanel` → webview mode `erDiagram`.

### Webview

- Стили через CSS variables `--vscode-*`.
- **`acquireVsCodeApi()` — строго один раз** на webview: использовать `webview-ui/src/vscodeApi.ts` (`getVsCodeApi()`).
- Режимы одного бандла: `window.__SQL_STUDIO_MODE__` = `results` | `connection` | `erDiagram`.
- Сообщения extension ↔ webview: `postMessage` (`save`, `cancel`, `test`, `testResult`, `exportCsv`, `exportXlsx`, `notify`).
- Ошибки `query/execute`: `QueryResult.error` → компонент `QueryError` (summary + collapsible stack trace), не plain text.
- Results table: resizable columns (`columnSizing`), content-based defaults via `computeColumnSizes`.
- Chart view: `ResultsChart` + `chartConfig` (ECharts). Bar layout `horizontal-scroll` для многих категорий. Pie с >12 категорий — scroll legend; pinch-zoom — `pieChartGestures.ts`.
- ER diagram: scroll/drag pan, Ctrl+scroll or pinch zoom, autofit on open — `erDiagramGestures.ts` + `ErDiagramView.tsx`; column-level edge handles (`columnHandleTop`), click edge → red marching-ants animation (child FK → parent PK), draggable midpoint reroute (`ColumnEdge`, `routeCenterX/Y`).
- Execution plan: `ExplainPlanView` при `plan_tree` или `plan_text`; режимы Tree / Table / Raw; поиск, expand/collapse, copy raw/JSON; badges по типу узла и теги `full_scan` / `expensive`.

### Запросы SQL

- Команда `sqlStudio.createSqlQuery` — открывает untitled-редактор, выставляет active connection.
- `.sql` по умолчанию: `configurationDefaults` + `ensureSqlStudioLanguage()` при открытии.
- Connection: per-file (`workspaceState`) → active → quick pick; status bar `sqlStudio.selectConnection`.
- `sqlStudio.runQuery` — `findSqlStudioEditorReady()` после привязки языка.
- `sqlStudio.runAllInFile` — Cmd+Shift+Enter; `sqlStudio.cancelQuery` — отмена через backend.
- Перед run: если connection не выбран → warning + **Select Connection**; если не active → **Connect** / Cancel.
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

Шаблон в `.cursor/mcp.json` запускает `uv run sql-studio-mcp`. MCP пока stub — расширять в `python/sql_studio/mcp_server.py`.

Команды редактора для агента:

- `sqlStudio.showExecutionPlan` — structured EXPLAIN для запроса под курсором (Shift+Cmd+E); Results panel: Tree / Table / Raw
- `sqlStudio.filterSchemaObjects` / `editSchemaObjectFilter` / `clearSchemaObjectFilter` — фильтр объектов в Explorer
- `sqlStudio.manageConnectionTags` — управление тегами connection
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

1. Add Connection → Test Connection → tags (optional)
2. Expand schema → filter objects → click table → preview 1000 rows
3. Schema/database → View ER Diagram → pan/zoom
4. `.sql` file → Cmd+Enter → results panel; Shift+Cmd+E → execution plan

## Частые ошибки

| Симптом | Решение |
|---------|---------|
| Backend not started | `uv` не в PATH → `sqlStudio.uvPath`; выполнить `cd python && uv sync` |
| Explorer пустой | Test Connection; проверить credentials |
| Webview пустой | `npm run build:webview`; проверить `webview-ui/dist/assets/` |
| Диалог connection без полей | Повторный `acquireVsCodeApi()` — только через `getVsCodeApi()` |
| Test connection зависает | ClickHouse: Native + 9000, не HTTP на 9000; проверить таймаут backend |
| MSSQL: ODBC driver not found | Установить `msodbcsql18`; `odbcinst -q -d` на macOS/Linux |
| Ошибка «No executable SQL» | В файле только комментарии; добавить `SELECT` или выделить текст запроса |
| Import errors в extension | `npm run lint` |

## Что не делать

- Не коммитить `node_modules/`, `python/.venv/`, `dist/`, `*.vsix`, `.env`.
- Не хранить пароли в git или plain JSON.
- Не добавлять `requirements.txt` — только `pyproject.toml` + uv.
- Не ломать stdio JSON-RPC протокол без обновления `pythonClient.ts`.

## Связанная документация

- [README.md](README.md) — user install and features (English)
- [README.ru.md](README.ru.md) — установка в Cursor (русский)
- [CONTRIBUTING.md](CONTRIBUTING.md) — contributor workflow
- [SECURITY.md](SECURITY.md) — security policy
- [python/README.md](python/README.md) — uv workflow для backend
- [CHANGELOG.md](CHANGELOG.md) — история изменений
