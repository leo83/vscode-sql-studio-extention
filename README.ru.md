# SQL Studio

[![CI](https://github.com/levragulin/cursor-sql-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/levragulin/cursor-sql-studio/actions/workflows/ci.yml)
[![License: Beerware](https://img.shields.io/badge/License-Beerware-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue)](https://code.visualstudio.com/)

Расширение для **Cursor** и **VS Code**: написание SQL, просмотр схемы базы в sidebar, выполнение запросов и интерактивный просмотр результатов.

> **English documentation:** [README.md](README.md)

Поддерживаются **PostgreSQL**, **ClickHouse**, **Microsoft SQL Server**, **MySQL** и **SQLite**.

## Возможности

**Редактор**

- Подсветка SQL (PostgreSQL / ClickHouse / T-SQL / MySQL / SQLite / generic `.sql`)
- **Create SQL Query** — новый редактор запроса из Command Palette или ПКМ на connection
- Выполнение запросов: **Cmd+Enter** / **Ctrl+Enter** (работает и при фокусе вне редактора, если открыт один SQL-файл)
- **Run Selection** и **Run All in File** (**Cmd+Shift+Enter** / **Ctrl+Shift+Enter**); **Cancel Query** в toolbar редактора во время выполнения
- **План выполнения**: **Shift+Cmd+E** / **Shift+Ctrl+E** (команда *Show Execution Plan*; для PostgreSQL опционально `sqlStudio.explainAnalyze`); в Results — режимы **Tree**, **Table**, **Raw**, поиск по узлам, метрики и копирование
- **Format SQL** и разбиение на выражения через `sqlglot`, по диалектам
- Предупреждение, если connection не выбран или не активен; предупреждение перед unbounded `SELECT` по большой таблице с кнопкой **Run, don't warn again**, которая отключает проверку
- Действия для агентов Cursor: **Ask Agent to Explain Query**, **Ask Agent to Fix/Optimize Query**

**Database Explorer**

- Ленивое дерево схемы: schemas / databases → tables, views, functions → columns
- **Теги подключений** — цветные метки на connections (в диалоге подключения или **Manage Tags**); отображаются в описании и иконке в Explorer
- **Фильтр объектов схемы** — иконка фильтра на узлах schema/database для поиска таблиц, view и функций по имени; **Edit Filter** / **Reset Filter**
- ПКМ на schema/database: **View ER Diagram** (раскладка из DBML, связи на уровне колонок, перетаскивание маршрута, клик по связи — красная анимация «муравьи» от дочерней к родительской таблице, pan/zoom/autofit, **Fit to view**, **Copy DBML**, **Open in dbdiagram.io**) и **Get DBML** (копирование в буфер)
- ПКМ на объект схемы: **Object Description**, **Sample Data**, **Export Data…**, **Copy Name**, **Create SQL Query**, **Generate SELECT**
- Клик по таблице / view → preview данных в том же UI, что и результаты запроса, с пагинацией и **Load all rows**

**Результаты**

- Изменяемая ширина колонок (по содержимому по умолчанию), перетаскивание для смены порядка, скрытие колонки, сортировка
- **Запоминание раскладки** — порядок колонок, скрытые колонки, ширины и сортировка восстанавливаются для каждого запроса (LRU по последним запросам, `sqlStudio.rememberedTableLayouts`); **Reset layout** возвращает колонки текущего запроса в исходное состояние
- Фильтр по загруженным строкам: `=`, `!=`, `~` / `!~` (содержит), `in (…)` / `not in (…)`, `>`, `>=`, `<`, `<=`, `is null` / `is not null`, `is empty` / `is not empty`, комбинации через `AND` / `OR`; сброс одной кнопкой; счётчик показывает `<подошло> of <всего> rows`
- ПКМ на колонке → **Filter values** показывает уникальные значения колонок с низкой кардинальностью; выбор добавляет `column=value`
- Пагинация с выбором размера страницы и **Load all rows**; серверный или клиентский режим загрузки (`sqlStudio.fetchMode`, `sqlStudio.serverPageSize`)
- **Refresh** перезапускает тот же SQL, не выходя из панели, сохраняя фильтр, текущий режим, сортировку и порядок колонок
- В toolbar показан запрос, давший результаты, — раскрывается в прокручиваемом hover-поповере
- Копирование строки (**Cmd+Alt+C**), значения (**Cmd+C**) и имени колонки
- Экспорт в CSV / Excel **как в гриде** — учитывает активный фильтр, сортировку, скрытые и переставленные колонки
- **Ошибки запросов** — краткое сообщение, код ошибки СУБД, stack trace в свёрнутом блоке

**Графики**

- line, bar (колонки или horizontal scroll при многих категориях), scatter, area, pie, heatmap; иконки выбора типа
- Выбор колонок X/Y, серии, агрегация и **Value labels** (Off / Value / Percent) — подписи прямо на столбцах, линиях и сегментах
- Pie открывается с разумными значениями по умолчанию; при многих категориях — прокручиваемая легенда; зум жестом или Ctrl/Cmd + колёсико
- Фильтр строк общий с таблицей, а переключение Table ↔ Chart сохраняет позицию скролла таблицы

**Подключения**

- **Диалог подключения** (webview): создание и редактирование в одном окне, поля зависят от диалекта, опциональные теги, **Test connection**
- Пароли connections хранятся **зашифрованно** (OS keychain через VS Code SecretStorage)
- **ClickHouse Native (TCP, порт 9000)** и **HTTP (8123)** — как Native Driver / HTTP в TablePlus
- **Microsoft SQL Server** — подключение через ODBC (pyodbc), Schema Explorer, T-SQL (`.tsql`)
- **MySQL** — через `pymysql`; **SQLite** — локальный файл `.sqlite` / `.db`
- Акцентные цвета следуют теме редактора, переопределяются через `sqlStudio.accentColor` / `sqlStudio.chartAccentColors`
- Интеграция с агентами Cursor (rules, MCP-шаблон)

## Скриншоты

**Результаты запроса (таблица)** — Database Explorer, SQL-редактор и панель SQL Results: сортировка, фильтр-выражение, пагинация (`Rows 1–10`, размер страницы, `Load all rows`), `Refresh` и экспорт в CSV/Excel:

![Результаты запроса — таблица](https://raw.githubusercontent.com/leo83/vscode-sql-studio-extention/main/docs/images/results-table.png)

**Фильтр результатов** — выражения по загруженным строкам (`col=value`, `col in (a,b)`, `col is null/empty`, `AND` / `OR`); в тулбаре видно, сколько из них подошло:

![Фильтр результатов](https://raw.githubusercontent.com/leo83/vscode-sql-studio-extention/main/docs/images/results-filter.png)

**Контекстное меню таблицы** — скопировать строку, значение или имя колонки, скрыть колонку, выбрать значения для фильтра из загруженных строк:

![Контекстное меню таблицы](https://raw.githubusercontent.com/leo83/vscode-sql-studio-extention/main/docs/images/results-context-menu.png)

**Результаты запроса (график)** — line, bar, scatter, area, pie и heatmap по колонкам результата: выбор колонок X/Y, серии, агрегация и подписи значений. Для pie с большим числом категорий — прокручиваемая легенда; pinch-to-zoom (жест двумя пальцами или Ctrl/Cmd + колёсико) работает на области графика, скролл тачпадом — по легенде:

![Результаты запроса — линейный график](https://raw.githubusercontent.com/leo83/vscode-sql-studio-extention/main/docs/images/results-chart-line.png)

Pie группирует по выбранной колонке-метке и подписывает сегменты значениями или процентами:

![Результаты запроса — круговая диаграмма](https://raw.githubusercontent.com/leo83/vscode-sql-studio-extention/main/docs/images/results-chart.png)

**ER-диаграмма** — ПКМ на schema или database → **View ER Diagram**: раскладка из DBML со связями на уровне колонок, pan и zoom, перетаскивание таблиц, клик по связи для подсветки, **Fit to view**, **Copy DBML** и **Open in dbdiagram.io**:

![ER-диаграмма](https://raw.githubusercontent.com/leo83/vscode-sql-studio-extention/main/docs/images/er-diagram.png)

## Архитектура

| Слой | Стек | Назначение |
|------|------|------------|
| Extension | TypeScript | UI, explorer, webview, SecretStorage |
| Backend | Python + **uv** | JSON-RPC: запросы, схема, export (`python/sql_studio/`) |
| Webview UI | React + Vite | Таблица результатов и диалог подключений |

Структура backend:

```
python/
├── sql_studio/          # пакет (server, drivers, dialect, export)
├── tests/               # pytest
├── pyproject.toml
└── uv.lock
```

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

### Горячие клавиши

| Действие | macOS | Windows / Linux |
|----------|-------|-----------------|
| Выполнить запрос под курсором | Cmd+Enter | Ctrl+Enter |
| Выполнить все statements в файле | Cmd+Shift+Enter | Ctrl+Shift+Enter |
| План выполнения | Shift+Cmd+E | Shift+Ctrl+E |

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
| Новый SQL | ПКМ → **Create SQL Query** или **Generate SELECT** |
| Имя объекта | ПКМ → **Copy Name** |
| Фильтр объектов | Иконка фильтра на schema/database → ввод подстроки имени |
| Теги connection | ПКМ → **Manage Tags** или в диалоге подключения |
| ER-диаграмма | ПКМ на schema/database → **View ER Diagram** (pan, zoom, перетаскивание таблиц, клик по связи — красные «муравьи» FK→PK, перетаскивание midpoint для маршрута, **Fit to view**, **Copy DBML**, **Open in dbdiagram.io**) |
| Запрос | `.sql` + connection в status bar + **Cmd+Enter** |
| Формат SQL | **`SQL Studio: Format SQL`** |
| Агент | **`SQL Studio: Ask Agent to Explain Query`** / **`Ask Agent to Fix/Optimize Query`** |

### Настройки (Cursor Settings → SQL Studio)

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `sqlStudio.uvPath` | `uv` | Путь к uv |
| `sqlStudio.previewRowLimit` | `1000` | Строк при preview |
| `sqlStudio.defaultRowLimit` | `10000` | Лимит SQL-запросов |
| `sqlStudio.fetchMode` | `server` | Как загружаются результаты: постранично с бэкенда (`server`) или все строки сразу (`client`) |
| `sqlStudio.serverPageSize` | `500` | Строк на страницу, когда `sqlStudio.fetchMode` — `server` |
| `sqlStudio.warnOnLargeUnboundedSelect` | `true` | Предупреждать перед unbounded SELECT по большим таблицам |
| `sqlStudio.largeTableRowThreshold` | `5000` | Порог оценки строк для предупреждения |
| `sqlStudio.accentColor` | _(пусто)_ | Основной акцент SQL Studio webview (hex) |
| `sqlStudio.chartAccentColors` | `[]` | Цвета серий графиков (массив hex) |
| `sqlStudio.defaultDialect` | `postgres` | Dialect по умолчанию |
| `sqlStudio.autoAssociateSqlFiles` | `true` | `.sql` в режиме SQL Studio |
| `sqlStudio.promptForConnectionOnRun` | `false` | Спрашивать connection перед run |
| `sqlStudio.promptForConnectionOnOpen` | `true` | Спрашивать при открытии `.sql` |
| `sqlStudio.explainAnalyze` | `false` | PostgreSQL: `EXPLAIN ANALYZE` (выполняет запрос). Для остальных диалектов используется structured EXPLAIN (JSON/XML/query plan) с интерактивным деревом, когда поддерживается |
| `sqlStudio.rememberedTableLayouts` | `30` | Сколько последних запросов сохраняют раскладку таблицы результатов (порядок колонок, скрытые колонки, ширины, сортировку). `0` — отключить |
| `sqlStudio.showRatingPrompt` | `true` | Иногда просить оценку на Marketplace после успешного запроса |

---

## Конфиденциальность

- **Телеметрии нет** — данные использования никуда не отправляются. Запрос оценки считает успешные запросы только в локальном `globalState`; ничего не отправляется, а `sqlStudio.showRatingPrompt` выключает подсказку.
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

**Lev Ragulin** — [leo@levragulin.ru](mailto:leo@levragulin.ru)

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
