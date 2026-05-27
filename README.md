# SQL Studio

Расширение для **Cursor** и **VS Code**: написание SQL, просмотр схемы базы в sidebar, выполнение запросов и интерактивный просмотр результатов. Поддерживаются **PostgreSQL** и **ClickHouse**.

## Возможности

- Подсветка SQL (PostgreSQL / ClickHouse / generic `.sql`)
- **Database Explorer** — schemas → tables → columns
- Клик по таблице → preview данных (тот же UI, что и для SQL)
- Выполнение запросов: **Cmd+Enter** / **Ctrl+Enter**
- Таблица результатов: сортировка, фильтр, пагинация, экспорт CSV/Excel
- Пароли connections хранятся **зашифрованно** (OS keychain через VS Code SecretStorage)
- Интеграция с агентами Cursor (rules, MCP-шаблон)

## Архитектура

| Слой | Стек | Назначение |
|------|------|------------|
| Extension | TypeScript | UI, explorer, webview, SecretStorage |
| Backend | Python + **uv** | JSON-RPC: запросы, схема, export |
| Results UI | React + TanStack Table | Таблица результатов |

Backend запускается автоматически:

```bash
uv run --directory python sql-studio-server
```

---

## Локальная установка (без Marketplace)

Расширение **пока не опубликовано** в Marketplace Cursor/VS Code. Установка только локально — двумя способами:

| Способ | Когда использовать |
|--------|-------------------|
| **[A. Extension Development Host (F5)](#a-режим-разработки-f5)** | Разработка, быстрая итерация, отладка |
| **[B. Установка из `.vsix`](#b-установка-из-vsix)** | Постоянное использование в основном окне Cursor |

### Требования

- [Cursor](https://cursor.com/) 0.40+ (или VS Code 1.85+)
- [Node.js](https://nodejs.org/) 18+
- [uv](https://docs.astral.sh/uv/) — Python backend и зависимости
- (опционально) [just](https://github.com/casey/just) — shortcuts из `justfile`

```bash
# uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# проверка
node --version
uv --version
```

---

### A. Режим разработки (F5)

Подходит, если вы клонировали репозиторий и хотите запускать расширение из исходников.

**1. Клонировать и открыть проект**

```bash
git clone <url-репозитория> cursor-sql-studio
cd cursor-sql-studio
cursor .    # или File → Open Folder в Cursor
```

**2. Собрать проект**

```bash
just install && just build
```

Без `just`:

```bash
npm install
cd webview-ui && npm install && cd ..
cd python && uv sync --all-groups && cd ..
npm run build
```

**3. Запустить Extension Development Host**

- Откройте панель **Run and Debug** (иконка play с жуком слева)
- Выберите конфигурацию **Run Extension**
- Нажмите **F5** (или Run → Start Debugging)

Откроется **второе окно Cursor** с пометкой **`[Extension Development Host]`** — работать с SQL Studio нужно **в этом окне**.

**4. Проверить установку**

- Слева в Activity Bar — иконка **SQL Studio**
- `Cmd+Shift+P` → `SQL Studio: Add Connection` — команда должна находиться

**5. Если backend не стартует**

Cursor может не видеть `uv` в PATH. Укажите полный путь:

- **Cursor Settings** → `SQL Studio: Uv Path`
- macOS (типично): `/Users/<user>/.local/bin/uv` или `which uv` в терминале

После изменений в коде:

```bash
just build
# в Extension Development Host: Cmd+Shift+P → Developer: Reload Window
```

---

### B. Установка из `.vsix`

Подходит для **ежедневного использования** в обычном окне Cursor (не Dev Host).

**1. Собрать `.vsix`**

```bash
cd cursor-sql-studio
just install
just package
```

Или:

```bash
npm install
cd webview-ui && npm install && cd ..
cd python && uv sync --all-groups && cd ..
npm run build
npx vsce package --no-dependencies
```

В корне появится файл вида `cursor-sql-studio-0.1.0.vsix`.

**2. Установить в Cursor**

- `Cmd+Shift+P` → **`Extensions: Install from VSIX...`**
- Выберите `cursor-sql-studio-0.1.0.vsix`
- `Cmd+Shift+P` → **`Developer: Reload Window`**

**3. Проверить**

- Activity Bar → иконка **SQL Studio**
- **Extensions** (`Cmd+Shift+X`) → в списке **Installed** должно быть **SQL Studio**

**4. Зависимости runtime**

Расширение при работе вызывает:

```bash
uv run --directory <путь-к-расширению>/python sql-studio-server
```

Нужно:

- **`uv` в PATH** (или настройка `sqlStudio.uvPath`)
- При первом запуске uv создаст venv внутри `python/` расширения

Проверка в терминале:

```bash
uv --version
```

**5. Обновление после изменений в коде**

```bash
just package
# снова Extensions: Install from VSIX... (перезапишет локальную версию)
# Developer: Reload Window
```

**6. Удаление**

- Extensions → SQL Studio → **Uninstall**
- (опционально) удалить сохранённые connections — они в global state Cursor

---

## Подключение плагина в Cursor

> См. раздел [Локальная установка](#локальная-установка-без-marketplace) выше. Marketplace **не используется**.

### Первое подключение к базе

1. Откройте sidebar **SQL Studio** → **Database Explorer**
2. Нажмите **+** (Add Connection) или Command Palette → **`SQL Studio: Add Connection`**
3. Заполните:
   - Dialect: **PostgreSQL** или **ClickHouse**
   - Host, Port, Database, Username, Password
   - SSL / Read-only — по необходимости
4. Пароль сохранится в **зашифрованном виде** (Keychain на macOS)
5. ПКМ на connection → **Test Connection**
6. ПКМ → **Set Active Connection**

---

### Работа с данными

| Действие | Как |
|----------|-----|
| Preview таблицы | Клик по таблице в Explorer |
| SQL-запрос | Открыть `.sql` / `.pgsql` / `.chsql`, **Cmd+Enter** |
| Формат SQL | Command Palette → `SQL Studio: Format SQL` |
| Экспорт | Кнопки в панели результатов |
| Спросить агента | `SQL Studio: Ask Agent to Explain Query` |

### Настройки (Cursor Settings → SQL Studio)

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `sqlStudio.uvPath` | `uv` | Путь к uv |
| `sqlStudio.previewRowLimit` | `1000` | Строк при preview таблицы |
| `sqlStudio.defaultRowLimit` | `10000` | Лимит для SQL-запросов |
| `sqlStudio.defaultDialect` | `postgres` | Dialect по умолчанию |

---

### Интеграция с Cursor Agent

В репозитории уже есть шаблоны:

- [`.cursor/rules/sql-agent.mdc`](.cursor/rules/sql-agent.mdc) — правила для `.sql` файлов
- [`.cursor/mcp.json`](.cursor/mcp.json) — шаблон MCP-сервера

Чтобы агент видел правила в **вашем** проекте с SQL, скопируйте `sql-agent.mdc` в `.cursor/rules/` workspace, где вы пишете запросы.

---

## Разработка

```bash
just install      # npm + uv sync
just build        # extension + webview
just test         # pytest + tsc
just uv-server    # backend вручную (stdio)
just package      # .vsix
```

Подробнее про Python backend: [python/README.md](python/README.md).

Инструкции для AI-агентов: [AGENTS.md](AGENTS.md).

## License

MIT
