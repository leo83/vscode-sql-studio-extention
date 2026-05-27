# SQL Studio

Расширение для **Cursor** и **VS Code**: написание SQL, просмотр схемы базы в sidebar, выполнение запросов и интерактивный просмотр результатов. Поддерживаются **PostgreSQL** и **ClickHouse**.

## Возможности

- Подсветка SQL (PostgreSQL / ClickHouse / generic `.sql`)
- **Database Explorer** — schemas → tables / views / functions → columns
- ПКМ на объект схемы: **Object Description**, **Sample Data**, **Export Data**, **Create SQL Query**
- Клик по таблице / view → preview данных (тот же UI, что и для SQL)
- **Create SQL Query** — новый редактор запроса из Command Palette или ПКМ на connection
- Выполнение запросов: **Cmd+Enter** / **Ctrl+Enter** (работает и при фокусе вне редактора, если открыт один SQL-файл)
- Таблица результатов: сортировка, фильтр, пагинация, экспорт CSV/Excel
- **Ошибки запросов** — краткое сообщение, код ClickHouse, stack trace в свёрнутом блоке
- Пароли connections хранятся **зашифрованно** (OS keychain через VS Code SecretStorage)
- **Диалог подключения** (webview): создание и редактирование в одном окне, поля зависят от диалекта
- **ClickHouse Native (TCP, порт 9000)** и **HTTP (8123)** — как Native Driver / HTTP в TablePlus
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

### B. Установка из `.vsix` (постоянная)

Подходит для **ежедневного использования** в обычном окне Cursor (не Dev Host).

#### 1. Собрать `.vsix`

```bash
cd cursor-sql-studio
just install && just package
```

Или по шагам:

```bash
npm install
cd webview-ui && npm install && cd ..
cd python && uv sync --all-groups && cd ..
npm run build
npx vsce package --no-dependencies --allow-missing-repository --no-rewrite-relative-links
```

В корне появится файл вида `cursor-sql-studio-0.1.0.vsix`.

> Команда `just package` уже включает нужные флаги `vsce`. Без `--no-rewrite-relative-links` сборка может упасть из‑за относительных ссылок в README.

#### 2. Установить в Cursor

В Cursor команда **`Extensions: Install from VSIX...`** иногда **не находится** в Command Palette. Используйте любой из способов ниже.

| Способ | Как |
|--------|-----|
| **Drag & drop** (рекомендуется) | `Cmd+Shift+X` → панель Extensions → перетащите `.vsix` в панель → подтвердите установку |
| **Меню Extensions** | Панель Extensions → **⋯** (три точки) → **Install from VSIX...** / **Install Extension from VSIX...** |
| **Command Palette** | `Cmd+Shift+P` → введите **`vsix`** или **`install vsix`** (не обязательно полное имя команды) |
| **Терминал** | Сначала: **Cursor → Install 'cursor' command in PATH**, затем: `cursor --install-extension /полный/путь/cursor-sql-studio-0.1.0.vsix` |

После установки: `Cmd+Shift+P` → **Developer: Reload Window**.

#### 3. Проверить

- Activity Bar → иконка **SQL Studio**
- **Extensions** (`Cmd+Shift+X`) → в **Installed** должно быть **SQL Studio**
- `Cmd+Shift+P` → **`SQL Studio: Add Connection`** — команда находится

#### 4. Зависимости runtime

Расширение при работе вызывает:

```bash
uv run --directory <путь-к-расширению>/python sql-studio-server
```

Нужно:

- **`uv` в PATH** (или настройка **`SQL Studio: Uv Path`** в Cursor Settings)
- при первом запуске uv создаст venv внутри `python/` установленного расширения

Проверка:

```bash
which uv
uv --version
```

Если backend не стартует — укажите полный путь к `uv`, например `/Users/<user>/.local/bin/uv`.

#### 5. Обновление после изменений в коде

```bash
just package
# переустановите .vsix (drag & drop или cursor --install-extension)
# Developer: Reload Window
```

#### 6. Удаление

- Extensions → SQL Studio → **Uninstall**
- (опционально) сохранённые connections лежат в global state Cursor

---

## Подключение плагина в Cursor

> См. раздел [Локальная установка](#локальная-установка-без-marketplace) выше. Marketplace **не используется**.

### Первое подключение к базе

1. Откройте sidebar **SQL Studio** → **Database Explorer**
2. Нажмите **+** (Add Connection) или Command Palette → **`SQL Studio: Add Connection`**
3. В модальном окне заполните поля (набор зависит от типа БД):

   | Поле | PostgreSQL | ClickHouse |
   |------|------------|------------|
   | Connection name | да | да |
   | Database type | PostgreSQL | ClickHouse |
   | Driver | — | **Native (TCP, 9000)** или **HTTP (8123)** |
   | Host, Port, Username, Password | да | да |
   | Database | обязательно | опционально (`default`) |
   | SSL / Read-only | да | да |

4. **Test connection** — проверка без сохранения (таймаут ~20 с)
5. **Save** — пароль сохранится в **зашифрованном виде** (Keychain на macOS)
6. В Explorer: разверните **Connections** → ПКМ на connection → **Set Active Connection**

#### ClickHouse: Native vs HTTP

| Режим | Порт | Когда использовать |
|-------|------|-------------------|
| **Native (TCP)** | 9000 (9440 + TLS) | Как TablePlus «Native Driver», внутренняя сеть |
| **HTTP** | 8123 (8443 + TLS) | ClickHouse Cloud, прокси, только HTTP |

> Порт **9000** с драйвером HTTP не работает — выберите **Native** в поле Driver.

Редактирование: ПКМ на connection → **Edit Connection** (тот же диалог).

#### Когда реально подключается к базе

| Вопрос | Ответ |
|--------|--------|
| Все сохранённые connections подключаются при старте Cursor? | **Нет** — в Explorer видны только профили |
| Когда создаётся TCP/DB-соединение? | При первом использовании: раскрыли connection, preview, SQL, export, object description |
| Одновременно подключены все connections? | **Нет** — только тот, с которым вы работаете (кэш на backend) |
| PostgreSQL: одна база или все на сервере? | **Одна** — поле Database в профиле connection |
| ClickHouse: все databases? | **Да**, но только после раскрытия connection в Explorer (`SHOW DATABASES`) |

Отключить активное соединение: ПКМ на connection → **Disconnect**.

---

### Работа с данными

| Действие | Как |
|----------|-----|
| Preview / sample data | Клик по table/view в Explorer или ПКМ → **Sample Data** |
| Описание объекта | ПКМ на table / view / function / procedure / column → **Object Description** |
| Экспорт данных таблицы | ПКМ → **Export Data…** (CSV, до `defaultRowLimit` строк) |
| Новый SQL из объекта | ПКМ → **Create SQL Query** (шаблон SELECT / CALL) |
| Новый SQL (connection) | Command Palette → **`SQL Studio: Create SQL Query`** или ПКМ на connection |
| SQL-запрос | Открыть `.sql`, connection в status bar, **Cmd+Enter** |
| Connection для файла | Status bar `$(database) …` или **SQL Studio: Select Connection for File** |
| Формат SQL | Command Palette → `SQL Studio: Format SQL` |
| Экспорт результатов запроса | Кнопки в панели **SQL Results** |
| Ошибка запроса | Панель **SQL Results**: краткий текст, Code/тип, stack trace, **Copy error** |
| Спросить агента | `SQL Studio: Ask Agent to Explain Query` |

### Настройки (Cursor Settings → SQL Studio)

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `sqlStudio.uvPath` | `uv` | Путь к uv |
| `sqlStudio.previewRowLimit` | `1000` | Строк при preview таблицы |
| `sqlStudio.defaultRowLimit` | `10000` | Лимит для SQL-запросов |
| `sqlStudio.defaultDialect` | `postgres` | Dialect по умолчанию |
| `sqlStudio.autoAssociateSqlFiles` | `true` | Открывать `.sql` в режиме SQL Studio |
| `sqlStudio.promptForConnectionOnRun` | `false` | Спрашивать connection перед каждым запуском |
| `sqlStudio.promptForConnectionOnOpen` | `true` | Спрашивать connection при открытии `.sql` без привязки к файлу |

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

---

## Автор

**lev** — [lev.ragulin@gmail.com](mailto:lev.ragulin@gmail.com)

## Отказ от ответственности

Проект распространяется **«как есть»**, без каких‑либо явных или подразумеваемых гарантий. Автор **не несёт ответственности** за возможные сбои, потерю данных, некорректные результаты запросов или любой другой ущерб, связанный с использованием расширения.

Вы используете SQL Studio **на свой страх и риск**, в том числе при подключении к production-базам и выполнении запросов, меняющих данные.

## Поддерживаемые СУБД

На данный момент поддерживаются **только два типа баз данных**:

- **PostgreSQL**
- **ClickHouse** (Native TCP и HTTP)

Другие СУБД (MySQL, SQLite, MS SQL Server и т.д.) **не поддерживаются**.

## Лицензия

Проект распространяется под лицензией [**The Beerware License (Revision 42)**](LICENSE) («Buy Me A Beer»):

> As long as you retain this notice you can do whatever you want with this stuff. If we meet some day, and you think this stuff is worth it, you can buy me a beer in return.

Полный текст — в файле [LICENSE](LICENSE).
