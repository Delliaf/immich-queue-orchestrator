# Совместимость с Immich

<!-- translation-source: docs/compatibility.md; source-sha256: 43fe07cef5dda3cae079410a8b572feefe43396391551ff48defa0d0b2a61738 -->

[English](../compatibility.md)

Проверенная база: Immich `v3.1.0` и source snapshot `483b375c26c91e9ad3d42666fff58b3fbda1164a`.

Используемые endpoints:

| Endpoint | Назначение | Статус Immich |
|---|---|---|
| `GET /api/server/version` | version gate | public/stable |
| `GET /api/server/features` | feature-aware pipeline | public |
| `GET /api/server/statistics` | upload activity | admin/stable |
| `GET /api/queues` | queue states/counters | alpha |
| `PUT /api/queues/{name}` | pause/resume | alpha |
| `GET /api/queues/{name}/jobs` | recovery evidence | alpha, ограниченная выборка |
| `PUT /api/jobs/{name}` | optional missing repair | deprecated с v2.4.0 |

Runtime ответы проверяются Zod schemas. Неизвестная queue не включается в managed allowlist. Неизвестная major-версия при strict mode блокирует control.

## Ограничения counters

- `completed` и `failed` retention-зависимы.
- Job inspection ограничен приблизительно первой тысячей элементов.
- `isPaused` — глобальное состояние queue; `statistics.paused` — количество jobs в paused list.
- `backgroundTask` нельзя ставить на паузу через Immich.

## Почему missing выполняется после drain

Legacy endpoint проверяет только active jobs. Большинство QueueAll jobs не имеют deduplication key. Start поверх waiting/paused backlog способен добавить повторную массовую работу. Поэтому controller сначала ждёт полный ноль pending states и только потом допускает один repair-pass.
