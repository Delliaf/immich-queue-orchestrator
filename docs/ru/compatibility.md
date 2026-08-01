# Совместимость с Immich

<!-- translation-source: docs/compatibility.md; source-sha256: 3fe1dd286c1b06500fb0b0d20a4fc410c094cec9ae9d7ae7c1e8288cce0519af -->

<!-- translation-source: docs/compatibility.md; source-sha256: pending -->

[English](../compatibility.md)

Проверенный baseline: Immich `v3.1.0`, source snapshot `483b375c26c91e9ad3d42666fff58b3fbda1164a`.

| Endpoint | Назначение | Статус Immich |
|---|---|---|
| `GET /api/server/version` | Проверка версии | Public/stable |
| `GET /api/server/features` | Feature-aware pipeline | Public |
| `GET /api/server/statistics` | Обнаружение загрузки | Admin/stable |
| `GET /api/queues` | Состояние и счётчики | Alpha |
| `PUT /api/queues/{name}` | Pause/resume | Alpha |
| `GET /api/queues/{name}/jobs` | Доказательство `QueueAll` и recovery | Alpha, ограниченный список |
| `PUT /api/jobs/{name}` | Missing check с `force=false` | Deprecated с v2.4.0, но используется admin UI Immich |

Runtime responses валидируются через Zod. Неизвестные queues не попадают в managed allowlist. В strict mode непроверенная major-версия Immich блокирует mutations.

Девять bulk names по умолчанию: создание миниатюр, извлечение metadata, sidecar, smart search, duplicate detection, face detection, facial recognition, OCR и video conversion. Их QueueAll mappings проверены по серверной реализации очередей, включая sidecar и facial recognition.

## Поведение discovery

Missing endpoint добавляет generator `QueueAll` в собственную целевую очередь. Поэтому paused-очередь не может создать инвентаризацию до временного resume. Оркестратор работает по одной очереди, наблюдает ожидаемый generator, после его исчезновения ставит managed-очередь на паузу и фиксирует оставшийся pending count. Существующий после restart generator принимается без дублирования; после прерывания загрузкой за ним выполняется ещё одна новая проверка.

Metadata extraction, sidecar, duplicate detection и facial recognition могут ненадолго показывать большой generated pending count, который быстро убывает на skipped/already-processed work. Оркестратор умеет наблюдать его падение ограниченными окнами и использовать стабильный остаток для панели и shortest-first priority.

Storage Template Migration намеренно исключена. В проверенном server это одна non-concurrent job, которая потоково проходит assets и перемещает файлы; её `active=1` не показывает оставшееся число assets. Системная Migration queue также исключена.

Endpoint неидемпотентен, а replacement bulk-start endpoint в проверенной версии отсутствует. Неоднозначная доставка требует решения оператора вместо автоматического retry.

Immich может явно отклонить start с HTTP 400, когда очередь уже active. Response body с `Job is already running` откладывает missing scan до завершения активной работы очереди, после чего контроллер повторяет запрос с небольшой задержкой. Уже идущая `QueueAll` scan принимается под наблюдение только тогда, когда её удалось определить через просмотр jobs. Другие явные 4xx ставят контроллер на паузу и сохраняют очищенное body в diagnostics; ambiguous operator gate используется только для сбоев без однозначного client response.

## Ограничения счётчиков

- `completed` и `failed` зависят от retention policy Immich.
- Просмотр jobs ограничен примерно первой тысячей записей.
- `isPaused` — глобальное состояние очереди, `statistics.paused` — число jobs в paused list.
- Pause не отменяет active jobs.
- Immich не разрешает ставить `backgroundTask` на паузу.
- Прогресс storage migration невозможно определить по обычным queue counts.
