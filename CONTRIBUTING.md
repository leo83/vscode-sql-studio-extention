# Contributing to SQL Studio

Thank you for considering a contribution. This project is a VS Code extension (TypeScript) with a Python backend (uv) and a React webview.

## Before you start

- Read [AGENTS.md](AGENTS.md) for architecture, JSON-RPC methods, and coding conventions.
- Read [README.md](README.md) for user-facing behavior and supported databases.
- **Do not commit secrets** — passwords belong only in VS Code SecretStorage, never in code or config files.

## Development setup

### Prerequisites

- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python 3.11+)
- Optional: [just](https://github.com/casey/just) for task shortcuts

### Install and build

```bash
git clone https://github.com/levragulin/cursor-sql-studio.git
cd cursor-sql-studio
just install
just build
```

Without `just`:

```bash
npm install
cd webview-ui && npm install && cd ..
cd python && uv sync --all-groups && cd ..
npm run build
```

### Run in Extension Development Host

1. Open the repo in VS Code or Cursor
2. **Run and Debug** → **Run Extension** → **F5**
3. Use the `[Extension Development Host]` window for manual testing

If the Python backend fails to start, set **SQL Studio: Uv Path** to the output of `which uv`.

### Tests

```bash
just test
```

This runs:

- `cd python && uv run pytest`
- `npm run lint` (TypeScript `tsc --noEmit`)

When changing the Python backend, also verify stdio JSON-RPC:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"health","params":{}}' | uv run --directory python sql-studio-server
```

## Project layout

| Path | Purpose |
|------|---------|
| `src/` | Extension host (TypeScript) |
| `webview-ui/` | React results table and connection dialog |
| `python/src/sql_studio/` | JSON-RPC server and database drivers |
| `grammars/` | TextMate SQL grammars |
| `.cursor/` | Agent rules and MCP template |

## Making changes

### Scope

- Keep diffs focused — avoid unrelated refactors.
- Match existing naming and file structure.
- Python dependencies: edit `python/pyproject.toml`, run `uv lock` if needed.
- Never store passwords in `globalState`, settings, logs, or MCP responses.

### Documentation

Update in the same PR when you change:

| File | When |
|------|------|
| [README.md](README.md) | User-visible features, install steps, settings |
| [README.ru.md](README.ru.md) | Same, Russian version |
| [AGENTS.md](AGENTS.md) | Architecture, JSON-RPC, file map |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes under `[Unreleased]` |

### Manual test checklist

Before submitting a PR that touches explorer or query flow:

1. Add Connection → Test Connection
2. Expand schema → click table → preview rows
3. Open `.sql` → Cmd/Ctrl+Enter → results panel
4. If MSSQL changed: verify ODBC driver is installed

## Pull requests

1. Fork the repository and create a feature branch from `master`
2. Run `just build && just test`
3. Open a PR with a clear description of **what** and **why**
4. Link related issues if applicable

Use the PR template checklist when filling out the description.

## Reporting bugs

Open a [GitHub Issue](https://github.com/levragulin/cursor-sql-studio/issues) using the bug report template. Include:

- VS Code / Cursor version
- Extension version
- Database type and OS
- Steps to reproduce
- Error message or screenshot

## Security

Do **not** report security vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the same [Beerware License](LICENSE) as the project.
