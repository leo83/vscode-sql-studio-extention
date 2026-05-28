# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

Security fixes are applied to the latest release on the `master` branch.

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Email **leo@levragulin.ru** with:

- Description of the issue and potential impact
- Steps to reproduce (if applicable)
- Extension version and environment (OS, VS Code/Cursor version)
- Any proof-of-concept you are comfortable sharing

You should receive a response within **7 days**. If the report is accepted, we will coordinate a fix and disclosure timeline.

## Security model

SQL Studio is designed with these properties:

### Credentials

- Database passwords are stored **only** in VS Code **SecretStorage** (encrypted by the operating system).
- Passwords are **not** stored in workspace settings, `globalState`, logs, or MCP tool responses.
- Connection profiles in settings contain host, port, username, and database name — **never** the password.

### Network and data flow

- SQL queries run **directly** from your machine to databases you configure.
- The Python backend runs **locally** via `uv`; it is not a hosted service operated by the author.
- The extension does **not** include telemetry or analytics that send usage data to third parties.

### Read-only mode

Connections support a **read-only** flag. Use it when exploring unfamiliar or production databases.

### Agent integration

- Cursor rules and MCP templates in this repository are **local** configuration helpers.
- Do not paste production credentials into agent chats or MCP prompts.

## Known dependencies and trust boundaries

| Component | Trust boundary |
|-----------|----------------|
| VS Code / Cursor | Host for SecretStorage and webviews |
| `uv` + Python venv | Local process spawned by the extension |
| Database drivers | Connect to **your** database servers |
| ODBC (MSSQL) | System driver must be installed separately |

Keep `uv`, Node.js (for development), and ODBC drivers updated through your normal OS package workflow.

## Best practices for users

- Prefer read-only connections for exploration.
- Limit database account permissions to what is needed.
- Do not commit connection details or `.env` files with secrets to git.
- Review SQL before running against production, especially multi-statement scripts.

## Third-party code

Third-party notices are in [third_party/NOTICE](third_party/NOTICE). Report vulnerabilities in bundled dependencies through this project so we can bump affected packages.
