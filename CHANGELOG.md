# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Connection dialog webview (create/edit) with dialect-specific fields and masked password
- ClickHouse Native TCP driver (`clickhouse-driver`, port 9000) alongside HTTP (`clickhouse-connect`, port 8123)
- Test connection from dialog with RPC/UI timeouts
- Database Explorer root node **Connections** always visible

### Changed

- Connection create/edit moved from sequential `showInputBox` prompts to modal webview
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
