# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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
