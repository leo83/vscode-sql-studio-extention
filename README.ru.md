# SQL Studio

Расширение для **Cursor** и **VS Code**: написание SQL, просмотр схемы базы в sidebar, выполнение запросов и интерактивный просмотр результатов.

> **English documentation:** [README.md](README.md)

Поддерживаются **PostgreSQL**, **ClickHouse**, **Microsoft SQL Server**, **MySQL** и **SQLite**.

## Возможности

- Подсветка SQL (PostgreSQL / ClickHouse / T-SQL / MySQL / SQLite / generic `.sql`)
- **Database Explorer** — schemas → tables / views / functions → columns
- ПКМ на объект схемы: **Object Description**, **Sample Data**, **Export Data**, **Create SQL Query**
- Клик по таблице / view → preview данных (тот же UI, что и для SQL)
- **Create SQL Query** — новый редактор запроса из Command Palette или ПКМ на connection
- Выполнение запросов: **Cmd+Enter** / **Ctrl+Enter** (работает и при фокусе вне редактора, если открыт один SQL-файл)
- Таблица результатов: сортировка, фильтр, пагинация, графики, экспорт CSV/Excel
- **Ошибки запросов** — краткое сообщение, код ошибки СУБД, stack trace в свёрнутом блоке
- Пароли connections хранятся **зашифрованно** (OS keychain через VS Code SecretStorage)
- **Диалог подключения** (webview): создание и редактирование в одном окне, поля зависят от диалекта
- **ClickHouse Native (TCP, порт 9000)** и **HTTP (8123)** — как Native Driver / HTTP в TablePlus
- **Microsoft SQL Server** — подключение через ODBC (pyodbc), Schema Explorer, T-SQL (`.tsql`)
- **MySQL** — через `pymysql`
- **SQLite** — локальный файл `.sqlite` / `.db`
- Интеграция с агентами Cursor (rules, MCP-шаблон)

## Архитектура

| Слой | Стек | Назначение |
|------|------|------------|
| Extension | TypeScript | UI, explorer, webview, SecretStorage |
| Backend | Python + **uv** | JSON-RPC: запросы, схема, export |
| Webview UI | React + Vite | Таблица результатов и диалог подключений |

Backend запускается автоматически:

```bash
uv run --directory python sql-studio-server
```

---

## Установка

### Из VS Code Marketplace

1. **Extensions** (`Cmd+Shift+X`) → поиск **SQL Studio** → **Install**
2. Установите **[uv](https://docs.astral.sh/uv/)** (обязательно для работы backend)
3. При необходимости укажите **SQL Studio: Uv Path** в настройках

### Локально (разработка или `.vsix`)

| Способ | Когда использовать |
|--------|-------------------|
| **[A. Extension Development Host (F5)](#a-режим-разработки-f5)** | Разработка, быстрая итерация, отладка |
| **[B. Установка из `.vsix`](#b-установка-из-vsix)** | Постоянное использование в основном окне Cursor |

### Требования

- [Cursor](https://cursor.com/) 0.40+ (или VS Code 1.85+)
- [Node.js](https://nodejs.org/) 18+ — только для сборки из исходников
- [uv](https://docs.astral.sh/uv/) — **обязателен в runtime** для Python backend
- (опционально) [just](https://github.com/casey/just) — shortcuts из `justfile`
- **Microsoft SQL Server:** установленный **ODBC Driver for SQL Server** на машине (см. [Microsoft SQL Server](#microsoft-sql-server))

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
node --version
uv --version
```

---

### A. Режим разработки (F5)

**1. Клонировать и открыть проект**

```bash
git clone https://github.com/levragulin/cursor-sql-studio.git
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

- Панель **Run and Debug** → **Run Extension** → **F5**
- Работать с SQL Studio нужно в окне **`[Extension Development Host]`**

**4. Если backend не стартует**

- **Cursor Settings** → `SQL Studio: Uv Path`
- macOS: `/Users/<user>/.local/bin/uv` или `which uv`

После изменений в коде: `just build` → **Developer: Reload Window** в Dev Host.

---

### B. Установка из `.vsix` (постоянная)

#### 1. Собрать `.vsix`

```bash
cd cursor-sql-studio
just install && just package
```

Или:

```bash
npm install
cd webview-ui && npm install && cd ..
cd python && uv sync --all-groups && cd ..
npm run build
npx vsce package --no-dependencies --no-rewrite-relative-links
```

Файл: `cursor-sql-studio-0.1.0.vsix`.

#### 2. Установить в Cursor

| Способ | Как |
|--------|-----|
| **Drag & drop** | `Cmd+Shift+X` → перетащите `.vsix` в панель Extensions |
| **Меню** | Extensions → **⋯** → **Install from VSIX...** |
| **Терминал** | `cursor --install-extension /полный/путь/cursor-sql-studio-0.1.0.vsix` |

**Developer: Reload Window** после установки.

#### 3. Runtime

- **`uv` в PATH** или настройка **`SQL Studio: Uv Path`**
- при первом запуске uv создаст venv в `python/` расширения

---

## Первое подключение к базе

1. Sidebar **SQL Studio** → **Database Explorer**
2. **+** или **`SQL Studio: Add Connection`**
3. Заполните поля (зависят от типа БД):

   | Поле | PostgreSQL | ClickHouse | SQL Server | MySQL | SQLite |
   |------|------------|------------|------------|-------|--------|
   | Connection name | да | да | да | да | да |
   | Database type | PostgreSQL | ClickHouse | Microsoft SQL Server | MySQL | SQLite |
   | Driver | — | Native / HTTP | ODBC | — | — |
   | Host, Port, Username, Password | да | да | да | да | путь к файлу |
   | Database | обязательно | опционально | обязательно | обязательно | путь `.sqlite` |
   | Port (по умолчанию) | 5432 | 9000 / 8123 | 1433 | 3306 | — |

4. **Test connection** → **Save**
5. ПКМ на connection → **Set Active Connection**

#### ClickHouse: Native vs HTTP

| Режим | Порт | Когда |
|-------|------|-------|
| **Native (TCP)** | 9000 | Внутренняя сеть |
| **HTTP** | 8123 | ClickHouse Cloud, только HTTP |

> Порт **9000** с драйвером HTTP не работает.

#### Microsoft SQL Server

Подключение через **pyodbc** и **системный ODBC-драйвер**.

| ОС | Установка |
|----|-----------|
| **macOS** | `brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release && brew install msodbcsql18` |
| **Windows** | [ODBC Driver 18](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server) |
| **Linux** | пакет `msodbcsql18` — [инструкция Microsoft](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server) |

Проверка: `odbcinst -q -d`

Редактирование: ПКМ → **Edit Connection**.

#### Когда создаётся соединение с БД

| Вопрос | Ответ |
|--------|--------|
| Все connections подключаются при старте? | **Нет** — только профили в Explorer |
| Когда TCP/DB-соединение? | При первом использовании (Explorer, SQL, export) |
| Отключить | ПКМ → **Disconnect** |

---

## Работа с данными

| Действие | Как |
|----------|-----|
| Preview / sample | Клик по table/view или ПКМ → **Sample Data** |
| Описание объекта | ПКМ → **Object Description** |
| Экспорт таблицы | ПКМ → **Export Data…** |
| Новый SQL | ПКМ → **Create SQL Query** |
| Запрос | `.sql` + connection в status bar + **Cmd+Enter** |
| Формат SQL | **`SQL Studio: Format SQL`** |
| Агент | **`SQL Studio: Ask Agent to Explain Query`** |

### Настройки (Cursor Settings → SQL Studio)

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `sqlStudio.uvPath` | `uv` | Путь к uv |
| `sqlStudio.previewRowLimit` | `1000` | Строк при preview |
| `sqlStudio.defaultRowLimit` | `10000` | Лимит SQL-запросов |
| `sqlStudio.defaultDialect` | `postgres` | Dialect по умолчанию |
| `sqlStudio.autoAssociateSqlFiles` | `true` | `.sql` в режиме SQL Studio |
| `sqlStudio.promptForConnectionOnRun` | `false` | Спрашивать connection перед run |
| `sqlStudio.promptForConnectionOnOpen` | `true` | Спрашивать при открытии `.sql` |

---

## Конфиденциальность

- **Телеметрии нет** — данные использования никуда не отправляются.
- **Пароли** — только VS Code SecretStorage (шифрование ОС).
- **Запросы** — напрямую между вашей машиной и вашей БД; backend локальный.

Подробнее: [SECURITY.md](SECURITY.md) (English).

---

## Интеграция с Cursor Agent

- [`.cursor/rules/sql-agent.mdc`](.cursor/rules/sql-agent.mdc)
- [`.cursor/mcp.json`](.cursor/mcp.json)

Скопируйте `sql-agent.mdc` в `.cursor/rules/` вашего workspace с SQL.

---

## Разработка

```bash
just install && just build && just test
just package
```

Подробнее: [CONTRIBUTING.md](CONTRIBUTING.md), [python/README.md](python/README.md), [AGENTS.md](AGENTS.md).

---

## Поддержка

- [GitHub Issues](https://github.com/levragulin/cursor-sql-studio/issues)
- [SECURITY.md](SECURITY.md) — уязвимости (не через публичные issues)

## Автор

**lev** — [lev.ragulin@gmail.com](mailto:lev.ragulin@gmail.com)

## Отказ от ответственности

Проект распространяется **«как есть»**. Вы используете SQL Studio **на свой страх и риск**, в том числе при работе с production-базами.

## Поддерживаемые СУБД

- **PostgreSQL**
- **ClickHouse** (Native TCP и HTTP)
- **Microsoft SQL Server** (T-SQL, ODBC Driver 18/17/13)
- **MySQL**
- **SQLite** (локальный файл)

## Лицензия

[**The Beerware License (Revision 42)**](LICENSE)
