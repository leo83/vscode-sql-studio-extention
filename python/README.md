# SQL Studio — Python backend (uv)

Backend запускается **только через [uv](https://docs.astral.sh/uv/)**. Зависимости и venv управляются из `pyproject.toml` + `uv.lock`.

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
