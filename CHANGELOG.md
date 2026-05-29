# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Connection tags** — color-coded labels on connections; edit in connection dialog or **Manage Tags**; shown in Explorer description and composite icons
- **Schema object name filter** — inline filter on schema/database nodes; **Edit Filter** / **Reset Filter** when active
- **Schema ER diagram & DBML** — context menu on schema (PostgreSQL, MSSQL, MySQL, SQLite) or database (ClickHouse): `View ER Diagram`, `Get DBML`; RPC `schema/getDbml`
- **ER diagram viewer** — pan (scroll/drag), pinch or Ctrl+scroll zoom, autofit on open, **Fit to view**, **Copy DBML**
- **Show Execution Plan** (`sqlStudio.showExecutionPlan`, Shift+Cmd+E / Shift+Ctrl+E): `query/explain` RPC, dialect-specific EXPLAIN (PostgreSQL text/ANALYZE, ClickHouse, MSSQL SHOWPLAN, MySQL, SQLite), monospace plan view in Results panel
- Setting `sqlStudio.explainAnalyze` (PostgreSQL `EXPLAIN ANALYZE`, executes the query)
- Warning before running unbounded `SELECT` (no `WHERE`, no `LIMIT`/`TOP`, non-aggregating): checks referenced tables with >5,000 estimated rows and recommends adding `LIMIT` (configurable via `sqlStudio.warnOnLargeUnboundedSelect` and `sqlStudio.largeTableRowThreshold`)
- Warning when no connection is selected or the chosen connection is not active before running SQL
- Configurable accent colors for SQL Studio webviews: `sqlStudio.accentColor` and `sqlStudio.chartAccentColors`
- Results table: resizable columns with content-based default widths; copy row (Cmd+Alt+C) and copy cell value
- Chart type picker icons; horizontal scroll bar layout for large category sets
- Webview unit tests for pie chart layout, ER diagram gestures, and gesture helpers (`cd webview-ui && npm run test`)
- Public repository documentation: English `README.md`, Russian `README.ru.md`
- `CONTRIBUTING.md`, `SECURITY.md`, GitHub issue/PR templates, CI workflow
- Marketplace metadata in `package.json` (`repository`, `keywords`, `galleryBanner`)
- Screenshot placeholder guide in `docs/images/README.md`

### Changed

- Pie charts fill the results panel; scroll legends use the full vertical space
- Pie chart pinch zoom (trackpad pinch / Ctrl+Cmd + scroll) and legend trackpad scroll use reliable hit regions
- ER diagram entity labels use `schema.table` form; column order matches database metadata
- Connection tags shown as `[name]` in Explorer description
- Python backend: flat package layout (`python/sql_studio/` instead of `python/src/sql_studio/`)
- Author contact: Lev Ragulin — leo@levragulin.ru
- CI status badge in README files
- README lists all supported databases (PostgreSQL, ClickHouse, MSSQL, MySQL, SQLite)
- `.vscodeignore` excludes dev artifacts (`__pycache__`, `.pytest_cache`, internal docs) from `.vsix`

## [0.1.0]

### Added

- **Microsoft SQL Server** support: `mssql` dialect, `MssqlDriver` (pyodbc), connection dialog, Schema Explorer, T-SQL language mode (`.tsql`)
- ODBC requirement documented in README and `python/README.md`
- Database Explorer context menu: Object Description, Sample Data, Export Data, Create SQL Query
- `schema/getObjectDescription` RPC and object description panel
- PostgreSQL functions/procedures in explorer tree
- Connection dialog webview (create/edit) with dialect-specific fields and masked password
- ClickHouse Native TCP driver (`clickhouse-driver`, port 9000) alongside HTTP (`clickhouse-connect`, port 8123)
- Test connection from dialog with RPC/UI timeouts
- Database Explorer root node **Connections** always visible
- **Create SQL Query** command (palette + context menu on connection)
- Formatted query error panel (`QueryError`: summary, code badge, collapsible stack trace, copy)

### Changed

- Connection create/edit moved from sequential `showInputBox` prompts to modal webview
- Run Query finds open SQL Studio editor when focus is elsewhere
- Query failures shown in Results panel, not only toast notification
- SQL comment-only buffers rejected with clearer message; improved sqlglot split fallback
- Documentation: README.md and AGENTS.md (incl. rule to keep docs in sync with architecture changes)
- README: Cursor `.vsix` install (drag & drop, CLI, menu), lazy connection behavior, explorer context menu

### Added (initial release)

- Initial SQL Studio extension scaffold
- PostgreSQL and ClickHouse drivers
- Database Explorer sidebar with lazy schema tree
- Encrypted password storage via VS Code SecretStorage
- Query results webview with TanStack Table (sort, filter, pagination)
- CSV and Excel export
- sqlglot-based SQL format and statement splitting
- Cursor agent rules and MCP template
- TextMate SQL grammar (from microsoft/vscode)
