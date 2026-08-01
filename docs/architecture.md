# Архитектура

```text
Web panel / HTTP actions
          |
          v
Application service + serial executor
          |
          v
Reconciliation state machine
     |               |
     v               v
state.json       journal.jsonl
          |
          v
Validated Immich HTTP adapters
```

## Границы

- Только публичный Immich HTTP API.
- Нет Redis/PostgreSQL writes.
- Нет Docker socket, container restart или job deletion.
- Не более одной managed queue unpaused во время processing pass.
- Неизвестные queues остаются unmanaged и отображаются в status.

## Основные состояния

```text
IDLE -> PREPARING
     -> GUARDED_IDLE -> CAPTURING_UPLOADS -> PROCESSING
     -> RUNNING_STAGE <-> WAITING_FOR_QUIET
     -> COMPLETED | GUARDED_IDLE

Любой управляемый проход может остановиться в:
PAUSED_BY_OPERATOR | AMBIGUOUS_START | DEGRADED | RELEASING
```

## Durable mutation protocol

Pause/resume:

```text
PREPARED (fsync) -> API call -> read response verification -> VERIFIED -> COMMITTED
```

После crash idempotent action reconciles по observed state. Если state совпадает с `before`, действие повторяется; если с `desired`, оно коммитится; третье состояние считается external override.

Legacy start не является idempotent. После неясного сетевого результата контроллер не делает retry. Он ищет QueueAll evidence с timestamp не старше prepared action; при недостатке доказательств переходит в `AMBIGUOUS_START`.

## State storage

- `state.json`: temp write, file fsync, atomic rename, directory fsync где поддерживается.
- `journal.jsonl`: append и fsync на каждую фазу mutation.
- Corrupt state не перезаписывается и переводит сервис в read-only.
- Все действия сериализуются внутри процесса.
- Неизменившийся tick не переписывает `state.json`; CPU hysteresis сохраняется только при изменении таймера или throttled state.

## Upload priority

Armed autopilot держит queues paused ещё до первого файла. Поэтому отсутствует гонка «успеть поставить паузу после появления первого job». Если upload появляется во время processing, controller pauses dispatch, ждёт active job и возвращается к capture quiet timer.

## Idle resource policy

- Active processing polls Immich каждые 5 секунд.
- `GUARDED_IDLE` polls каждые 10 секунд, что оставляет детекцию загрузки ниже 30 секунд.
- Standby без активного run polls каждые 30 секунд.
- CPU sampling существует только в processing phases.
- Docker image не запускает отдельный Node.js healthcheck; `/healthz` и `/readyz` остаются доступны внешнему мониторингу.
