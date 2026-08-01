# Архитектура

<!-- translation-source: docs/architecture.md; source-sha256: 14c43a50fb83c7355d0ffd0d98f4ab2bfb908bafd38f60238ccebc2a568015a2 -->

<!-- translation-source: docs/architecture.md; source-sha256: pending -->

[English](../architecture.md)

```text
Web-панель / HTTP actions
          |
          v
Рабочие настройки + serial orchestrator
          |
          v
Reconciliation state machine
     |            |              |
     v            v              v
state.json   journal.jsonl   settings.json
          |
          v
Валидируемые HTTP adapters Immich
```

## Границы

- Только публичный HTTP API Immich.
- Без записи в Redis/PostgreSQL, Docker socket, restart контейнеров и удаления jobs.
- Намеренно открывается не больше одной managed-очереди.
- Ignored и неизвестные очереди никогда не изменяются.
- Все mutations сериализованы в одном экономном Node.js process.

## Основной сценарий

```text
IDLE -> PREPARING -> DISCOVERING [-> стабилизация счётчика] -> INVENTORY_READY
                               -> RUNNING_STAGE <-> WAITING_FOR_QUIET
                               -> COMPLETED | GUARDED_IDLE

GUARDED_IDLE -> CAPTURING_UPLOADS -> DISCOVERING

загрузка во время DISCOVERING / INVENTORY_READY / processing
  -> pause managed queues -> CAPTURING_UPLOADS -> полный restart DISCOVERING
```

Включение автопилота и ручная команда «Проверить и обработать» обычно сразу переходят в `DISCOVERING`. Для каждой включённой очереди контроллер временно снимает паузу, запускает или принимает существующий missing generator `QueueAll`, следит за ним через queue-job API, фиксирует получившийся pending count и снова ставит managed-очередь на паузу. `INVENTORY_READY` удерживает найденные количества видимыми заданное короткое время перед обработкой.

Выбранные high-churn queues после `QueueAll` входят в ограниченную subphase стабилизации: очередь остаётся открытой, пока pending count быстро падает, затем контроллер фиксирует стабильный остаток. При shortest-first priority stages топологически выбираются по этому стабильному значению без нарушения dependencies.

Immich выполняет `QueueAll` внутри целевой очереди, поэтому наполнить полностью paused-очередь без временного открытия невозможно. Polling сокращает это окно, но существующие или только что созданные jobs могут успеть начаться до возврата паузы. Active work не отменяется.

## Режимы очередей

- `managed` — принадлежит serial scheduler и стоит на паузе при загрузке/guarded idle.
- `always-running` — участвует в discovery/order, но остаётся запущенной.
- `ignored` — исключена из stages и никогда не меняется.

Зависимости валидируются перед run. В частности, распознавание лиц идёт после обнаружения лиц.

Storage template и file migration — защищённые maintenance queues и никогда не входят в controlled stages.

## Durable mutation protocol

Pause/resume выполняются так:

```text
PREPARED (fsync) -> API call -> проверка ответа/чтением -> VERIFIED -> COMMITTED
```

После crash идемпотентные actions сверяются с наблюдаемым состоянием. Missing-check start неидемпотентен: после неоднозначного сетевого результата контроллер ищет `QueueAll` с подходящим timestamp и при недостатке доказательств спрашивает оператора. Слепого автоматического retry нет.

`state.json` и `settings.json` используют temporary write, fsync файла, atomic rename и, где возможно, fsync каталога. `journal.jsonl` дописывается с fsync. Повреждённый state сохраняется, а управление становится read-only. Неизменившиеся ticks и настройки не перезаписывают snapshots.

## Приоритет загрузки и ресурсы

В guarded idle managed-очереди уже стоят на паузе. Polling статистики обнаруживает рост assets за настроенный интервал, который валидируется ниже 30 секунд. Загрузка во время любого активного прохода сразу останавливает dispatch, после чего полная инвентаризация запускается заново через фиксированный или опционально зависящий от числа assets период тишины.

Discovery/processing обычно опрашиваются каждые 5 секунд, guarded idle — 10, standby — 30. CPU sampling обычно работает только в фазах, где нагрузка показывается или может приостановить dispatch; отдельная настройка оставляет тот же sampler включённым в idle. Отдельного Node.js healthcheck process нет.

## Наблюдаемость

Один встроенный structured logger пишет принятые записи в stdout контейнера и ограниченное кольцо в RAM. Обычный режим фиксирует lifecycle actions, Подробный добавляет изменения позиции контроллера и отклонённые вызовы Immich, Максимальный — наблюдения каждого poll и timings запросов. Запись позиции содержит run/phase identifiers, индексы discovery и processing, status текущего stage, число assets, pending count и API connectivity, поэтому повторяющийся цикл discovery становится виден напрямую.

Чувствительные ключи context скрываются до обоих outputs. Приложение не добавляет периодических записей логов на диск; diagnostic HTTP endpoint копирует RAM-кольцо только по запросу. Отчёт дополняет его текущим state и несекретными settings/configuration, чтобы проблему можно было воспроизвести без API credentials.
