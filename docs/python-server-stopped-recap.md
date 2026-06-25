# Recap: «Connection failed: Python server stopped» (ClickHouse)

> Дата разбора: 2026-06-25. Статус: диагностика завершена, фикс **не** реализован (код не меняли).

## Симптом

Часто всплывает попап `Connection failed: Python server stopped`. По наблюдениям пользователя:

- диалект — **только ClickHouse**;
- момент — **при подключении (Test/Connect)**, **после простоя**, иногда **случайно**.

## Откуда берётся сообщение

- Текст `Python server stopped` рождается в `src/pythonClient.ts` в обработчике
  `child.on("exit", …)` (≈стр. 109–113) и в `dispose()` (≈стр. 176–180):
  когда Python-процесс (`uv run … sql-studio-server`) **реально завершается**,
  все висящие запросы реджектятся этой ошибкой.
- Префикс `Connection failed:` добавляется в `src/connectionManager.ts:406` и
  `src/extension.ts:310` — то есть запрос, на котором ловится падение, это
  `connection/connect` / `connection/test`.

Важно: это **не пойманное Python-исключение** (такое вернулось бы как
error-строка из `_handle` в `server.py`), а именно смерть процесса —
сигнал (SIGSEGV/SIGKILL) либо выход с кодом.

## Архитектура (как есть)

- Один Python-процесс на всё расширение, JSON-RPC поверх stdio (`python/sql_studio/server.py`).
- `server.py:92-98`: `query/execute` и `query/explain` исполняются в **отдельных
  daemon-потоках**; всё остальное (`connect`, `disconnect`, `test`,
  `schema/listChildren`, `set_active_database`, `isConnected`) — в **главном потоке**.
- ClickHouse native: `python/sql_studio/drivers/clickhouse_native.py` держит один
  `clickhouse_driver.Client` (`self._client`) = **один сокет, не потокобезопасен**.
- Синхронизации (lock) **нет нигде** — ни в `clickhouse.py`, ни в `registry.py`.

## Корневая причина (рабочая гипотеза)

Непотокобезопасный native-сокет ClickHouse используется из двух потоков
одновременно без блокировки. Параллельные обращения к одному сокету ломают
протокол; с C-расширениями сжатия (lz4/zstd) это даёт **нативный segfault
(SIGSEGV) → процесс умирает → "Python server stopped"**.

Совпадение с триггерами:

| Триггер | Механизм |
|---|---|
| При connect/test | `ClickHouseDriver.connect()` → `disconnect()` закрывает сокет, пока daemon-поток ещё читает запущенный запрос |
| После простоя | ClickHouse рвёт idle-сокет; переподключение гонится с другим обращением |
| Случайно | Раскрытие дерева схемы (`schema/listChildren` в главном потоке `execute`) во время выполнения запроса (daemon `execute`) → два `execute` на одном сокете |

## Чем подтвердить окончательно

Открыть **Output → канал «SQL Studio Backend»**, воспроизвести, посмотреть строку
`Python server exited …`:

- **сигнал / нет Python-traceback перед смертью** → нативный краш (подтверждает гипотезу);
- **code 1 + Python traceback** → импорт/исключение на стороне Python (другой путь).

Диагностический нюанс: текущий обработчик `exit` логирует только `code`. При смерти
по сигналу `code === null`, и вся суть в `signal` — его в логе сейчас нет. Стоит
добавить второй аргумент `signal` в лог (предлагалось в `pythonClient.ts`, откатили).

## План фикса (когда решим внедрять)

1. **Per-driver lock** (`threading.Lock`): `execute` / `schema/*` / `test` /
   `connect` / `disconnect` / `set_active_database` берут его — две «нормальные»
   операции никогда не трогают сокет одновременно.
2. **`cancel_query` lock НЕ берёт** — закрытие сокета из другого потока это и есть
   штатный механизм прерывания запроса в ClickHouse (единственный разрешённый
   конкурентный доступ).
3. **Resilience (опционально):** авто-рестарт бэкенда + один повтор для
   идемпотентных операций (`connect`/`test`/`health`); **никогда** для `query/execute`.

Замечание по объёму: фикс затрагивает `registry.py` и драйверы, и требует
аккуратности на пути отмены (cancel) — поэтому делать осознанно, а не «по-быстрому».

## Затронутые файлы

- `src/pythonClient.ts` — где появляется текст и где логируется выход процесса.
- `src/connectionManager.ts:406`, `src/extension.ts:310` — префикс `Connection failed:`.
- `python/sql_studio/server.py:92-98` — daemon-потоки для query/execute|explain.
- `python/sql_studio/drivers/clickhouse_native.py` — общий непотокобезопасный `Client`.
- `python/sql_studio/drivers/clickhouse.py`, `python/sql_studio/drivers/registry.py` — нет блокировок.
