# Immich Queue Orchestrator — проверенный план проекта

Дата проверки: 2026-08-01
Статус: исследование и проектирование завершены; реализация требует отдельного подтверждения.

## 1. База проверки

- Последний стабильный релиз Immich на дату проверки: `v3.1.0`, commit `8aa95c67470a02a8ddedf03c2e52963af33065ff`.
- Текущий `main`: commit `483b375c26c91e9ad3d42666fff58b3fbda1164a` от 2026-07-31.
- Snapshot исходного handoff совпадает с текущим `main`. Изменений после snapshot на момент проверки нет.
- Между `v3.1.0` и snapshot нет изменений в Queue Controller, Job Controller, Queue Service, Job Repository, queue DTO, queue enum, pipeline jobs и ML-коде. Из просмотренных связанных файлов изменилась только нерелевантная строка документации `IMMICH_ALLOW_SETUP`.
- Рабочая папка проекта была пустой; существующего кода, который нужно сохранять или мигрировать, нет.

Официальные опорные источники:

- [Immich v3.1.0](https://github.com/immich-app/immich/releases/tag/v3.1.0)
- [текущий проверенный commit](https://github.com/immich-app/immich/commit/483b375c26c91e9ad3d42666fff58b3fbda1164a)
- [Jobs and Workers](https://docs.immich.app/administration/jobs-workers/)
- [Queue Controller](https://github.com/immich-app/immich/blob/483b375c26c91e9ad3d42666fff58b3fbda1164a/server/src/controllers/queue.controller.ts)
- [Legacy Job Controller](https://github.com/immich-app/immich/blob/483b375c26c91e9ad3d42666fff58b3fbda1164a/server/src/controllers/job.controller.ts)
- [Queue Service](https://github.com/immich-app/immich/blob/483b375c26c91e9ad3d42666fff58b3fbda1164a/server/src/services/queue.service.ts)
- [Job Repository](https://github.com/immich-app/immich/blob/483b375c26c91e9ad3d42666fff58b3fbda1164a/server/src/repositories/job.repository.ts)
- [Queue DTO](https://github.com/immich-app/immich/blob/483b375c26c91e9ad3d42666fff58b3fbda1164a/server/src/dtos/queue.dto.ts)
- [Queue names, job names and permissions](https://github.com/immich-app/immich/blob/483b375c26c91e9ad3d42666fff58b3fbda1164a/server/src/enum.ts)
- [Pipeline follow-up jobs](https://github.com/immich-app/immich/blob/483b375c26c91e9ad3d42666fff58b3fbda1164a/server/src/services/job.service.ts)
- [ML environment variables](https://docs.immich.app/install/environment-variables/)
- [Immich monitoring и Prometheus metrics](https://docs.immich.app/features/monitoring/)

## 2. Подтверждённые факты

### 2.1. API

Новый API всё ещё имеет статус alpha:

```text
GET    /api/queues
GET    /api/queues/{name}
PUT    /api/queues/{name}
GET    /api/queues/{name}/jobs
DELETE /api/queues/{name}/jobs
```

Он добавлен в v2.4.0 и в проверенном v3.1.0/main по-прежнему помечен `alpha('v2.4.0')`.

Legacy API всё ещё существует:

```text
GET /api/jobs
PUT /api/jobs/{name}
```

`PUT /api/jobs/{name}` остаётся единственным публичным массовым запуском обработки отсутствующих результатов. Endpoint deprecated с v2.4.0, но нового Queue API endpoint для массового start нет. Наличие enum permissions `queueJob.create` и `queueJob.update` не означает наличие соответствующих HTTP endpoints — в текущем Queue Controller их нет.

Необходимые permissions:

```text
queue.read       # статусы и counters
queue.update     # pause/resume
queueJob.read    # диагностика и best-effort reconciliation
job.create       # только missing-once через legacy start
```

Все queue endpoints дополнительно требуют admin user. `queueJob.delete` не нужен и не должен запрашиваться.

Версию можно читать публично через `GET /api/server/version`. Публичный `GET /api/server/features` сообщает, включены ли Smart Search, facial recognition, duplicate detection и OCR; его можно использовать для валидации preset без расширения permissions.

### 2.2. Очереди

Текущий `QueueName` содержит 19 значений:

```text
thumbnailGeneration
metadataExtraction
videoConversion
faceDetection
facialRecognition
smartSearch
duplicateDetection
backgroundTask
storageTemplateMigration
migration
search
sidecar
library
notifications
backupDatabase
ocr
workflow
integrityCheck
editor
```

Новые неизвестные очереди нельзя автоматически добавлять в managed allowlist.

Жёстко запрещённая очередь: `backgroundTask`. Сам Immich отклоняет её pause. Для основного медиаконвейера также запрещены по умолчанию `search`, `notifications`, `workflow`, `integrityCheck`, `editor`, `backupDatabase` и `migration`.

`library` и `sidecar` должны быть отдельными явно запускаемыми preflight/maintenance этапами, а не частью автоматического прохода по умолчанию.

### 2.3. Counters и job inspection

Queue response содержит:

```text
name
isPaused
statistics.active
statistics.completed
statistics.failed
statistics.delayed
statistics.waiting
statistics.paused
```

`isPaused` и `statistics.paused` имеют разную семантику. Пустая глобально paused очередь закономерно может иметь `paused=0`.

`GET /api/queues/{name}/jobs` внутри Immich вызывает BullMQ `getJobs(..., 0, 1000)`. Значит, inspection ограничен примерно первой тысячей элементов и не является полным источником истины для большой очереди.

`completed` и `failed` — исторические/retention-зависимые counters. Разница от baseline пригодна только как best-effort сигнал: очистка старых записей может скрыть одновременно появившиеся новые failures. В первой безопасной версии нельзя обещать точный failed delta или принимать необратимое решение только по нему.

### 2.4. Start и deduplication

Legacy start проверяет только `active > 0`. Наличие `waiting`, `paused` или `delayed` не блокирует повторный start.

Среди массовых media jobs дедуплицируется только `FacialRecognitionQueueAll`. `AssetExtractMetadataQueueAll`, `AssetGenerateThumbnailsQueueAll`, `AssetDetectFacesQueueAll`, `SmartSearchQueueAll`, `AssetDetectDuplicatesQueueAll`, `OcrQueueAll`, `AssetEncodeVideoQueueAll`, `SidecarQueueAll` и `LibraryScanQueueAll` не получают idempotency key/deduplication option.

Следствие: абсолютный exactly-once для legacy start после `kill -9` невозможен. Если запрос дошёл до Immich, а процесс погиб до записи acknowledgement, внешний controller не может всегда доказать результат.

Безопасная гарантия проекта должна звучать так:

> Оркестратор никогда не повторяет ambiguous legacy start автоматически. Он пытается найти подтверждение QueueAll job; если доказательств недостаточно, останавливается и требует явного решения оператора.

### 2.5. Pipeline

Автоматический pipeline нового upload подтверждён:

```text
upload
  -> metadataExtraction
  -> storageTemplateMigration
  -> thumbnailGeneration
  -> smartSearch -> duplicateDetection
  -> faceDetection -> facialRecognition
  -> ocr
  -> videoConversion (для video)
```

Важное уточнение: bulk `start missing` не воспроизводит весь downstream fan-out.

- Bulk metadata jobs не несут `source=upload`.
- Storage template job после bulk metadata также получает source без `upload/copy`.
- Поэтому thumbnail jobs не создаются автоматически после bulk metadata/storage.
- Bulk thumbnail jobs без `source=upload` не создают Smart Search, Face Detection, OCR и Video jobs.
- Bulk Smart Search без `source=upload` не создаёт Duplicate Detection.

Поэтому missing-once действительно должен инициировать каждый нужный bulk этап отдельно.

Зависимости, которые подтверждены кодом и данными jobs:

```text
metadataExtraction -> storageTemplateMigration -> thumbnailGeneration
thumbnailGeneration -> faceDetection -> facialRecognition
thumbnailGeneration -> smartSearch -> duplicateDetection
thumbnailGeneration -> ocr
metadataExtraction + thumbnailGeneration -> videoConversion
```

Для bulk-прохода `storageTemplateMigration` по умолчанию следует только дренировать, но не массово запускать: metadata extraction сама создаёт per-asset migration jobs. Отдельный bulk storage migration сканирует существующие assets и не является обычным «missing» этапом.

### 2.6. Sidecar

`SidecarQueueAll(force=false)` выбирает assets, у которых в базе ещё нет зарегистрированного sidecar-файла. Для каждого создаётся `SidecarCheck`.

После `SidecarCheck` Immich запускает metadata extraction и при `Success`, и при `Skipped`. Поэтому discover-проход может повторно извлечь metadata у большого числа assets, для которых физический sidecar вообще не найден. Такие assets снова будут кандидатами следующего запуска, поскольку запись sidecar не появилась.

Вывод: `sidecar.enabled=auto` небезопасен как default. Новый default — `false`; включение только явным opt-in, преимущественно перед metadata для внешней библиотеки.

### 2.7. QueueAll и завершение

QueueAll handlers перечисляют assets потоково и добавляют per-asset jobs пакетами. Родитель остаётся active во время перечисления, но counters могут быстро меняться между poll-запросами.

Условие кандидата на завершение:

```text
active == 0
waiting == 0
paused == 0
delayed == 0
```

Оно должно непрерывно сохраняться в течение `QUIET_PERIOD` после завершения `START_SETTLE_PERIOD`. Любая новая pending work сбрасывает quiet timer. Ошибка/timeout API никогда не преобразуется в нулевой snapshot.

`FacialRecognitionQueueAll` сам ждёт только отсутствие active jobs в thumbnail/face queues, а не полное отсутствие waiting/paused/delayed. Внешний scheduler обязан обеспечить более строгую prerequisite-completion до его запуска.

### 2.8. Nightly tasks

Nightly scheduler Immich может добавлять:

- database/background cleanup;
- memories;
- quota sync;
- `AssetGenerateThumbnailsQueueAll(force=false)`;
- `FacialRecognitionQueueAll(force=false, nightly=true)`.

Следовательно, missing thumbnails и face clustering могут появиться посреди run. Рекомендуется развести maintenance windows Immich и оркестратора. В любом случае новые jobs должны восприниматься как external work, а не как ошибка controller.

### 2.9. ML memory

Подтверждённые defaults:

```text
MACHINE_LEARNING_MODEL_TTL=300
MACHINE_LEARNING_MODEL_TTL_POLL_S=10
MACHINE_LEARNING_WORKERS=1
MACHINE_LEARNING_MODEL_INTER_OP_THREADS=1
MACHINE_LEARNING_MODEL_INTRA_OP_THREADS=2
```

Каждый ML worker process дублирует модели в памяти. ML API предоставляет только `/`, `/ping` и `/predict`; публичного endpoint, доказывающего выгрузку конкретной модели, нет.

Cooldown 30 секунд при стандартном TTL 300 секунд не решает исходную задачу. Low-memory preset должен либо:

1. рекомендовать уменьшенный `MACHINE_LEARNING_MODEL_TTL` и recreate ML-контейнера; либо
2. ждать не меньше `TTL + TTL_POLL + margin`.

Оркестратор принимает `ML_MODEL_TTL_HINT` и `ML_TTL_POLL_HINT`, предупреждает о слишком коротком cooldown, но не заявляет, что выгрузка доказана.

## 3. Исправления исходных требований

1. Вместо «exactly-once start» — `at-most-once automatic start + explicit ambiguous recovery`.
2. Вместо `sidecar.enabled=auto` — `false` по умолчанию.
3. Вместо общего default cooldown 30s — вычисляемый минимум по TTL hint либо явное предупреждение.
4. Вместо «одна очередь получает новые jobs» — «после drain не более одной managed queue unpaused и способна начать исполнение». Immich может складывать downstream jobs в другие, но paused, очереди.
5. Вместо точного failed delta — best-effort recent failure observation с явной неполнотой.
6. Вместо `STARTUP_POLICY=drain` безусловно — `reconcile`: без активного persisted run startup ничего не меняет.
7. Вместо автоматического DAG parallelism — DAG validation и строго один runnable stage в первой версии.
8. Вместо автоматического возврата к ранним этапам по умолчанию — `finish-pass`; это ограничивает starvation. Revisit включается явно и ограничивается budget.
9. Bulk storage migration, library scan, sidecar discovery, file migration и database backup вынесены из стандартного media preset.
10. UI, удаление jobs, Redis diagnostics, Docker socket, resource-triggered kill/restart и force reprocess не входят в безопасный MVP.

## 4. Окончательная архитектура

```text
CLI / read-only status HTTP
            |
            v
Application service (run, pause controller, abort, release)
            |
            v
Policy scheduler (validated DAG, strict serial execution)
            |
            v
Reconciliation state machine
       |                 |
       v                 v
Action journal       State snapshot
       |
       v
Immich protocol adapters
  - server info/features
  - Queue API control/status
  - Queue job inspection
  - isolated legacy start
```

### 4.1. Protocol layer

Использовать direct HTTP (`fetch`/Undici) и собственные Zod schemas, а не связывать ядро с `@immich/sdk`.

Причины:

- Queue API alpha;
- нужна runtime-проверка ответов, а не только TypeScript types;
- нужна поддержка нескольких Immich versions одним image;
- legacy start должен быть физически изолирован;
- SDK не решает crash-consistency и error classification.

Adapters не содержат scheduling logic.

### 4.2. Policy и engine как разные слои

- Queue-control engine знает observed/desired state, mutations, verification, journaling и recovery.
- Pipeline policy знает stages, dependencies, resource groups, enabled features и порядок.

Это позволяет менять preset без изменения safety-critical API-кода.

### 4.3. DAG внутри, serial scheduler снаружи

DAG нужен сразу для валидации зависимостей и выбора допустимого следующего этапа. Однако v1 запускает ровно один stage/resource group. Параллельные совместимые группы можно добавить позже, не меняя config model.

### 4.4. Action journal

Для каждой mutation:

```text
PREPARED -> API_CALL -> VERIFIED -> COMMITTED
```

Перед API call в журнал с `fsync` записываются run, queue, before, desired, action id и причина.

Для idempotent pause/resume после crash:

- observed == desired: завершить commit;
- observed == before: повторить mutation и verify;
- иначе: считать manual/external override и остановить controller.

Для non-idempotent legacy start:

- найден подходящий QueueAll job или pending work после intent: принять как sent;
- доказательств нет: `AMBIGUOUS_START`, автоматического retry нет;
- оператор выбирает `assume-sent`, `retry-start` или `abort/release`.

Хранилище:

- versioned `state.json` через temp-write, fsync и rename;
- append-only `journal.jsonl` с fsync перед mutation;
- compact checkpoint после завершённого run;
- испорченное состояние переводит процесс в read-only degraded mode.

### 4.5. State machine

```text
BOOT
  -> VALIDATING
  -> OBSERVE | IDLE
  -> PREPARING
  -> DRAINING
  -> STARTING_STAGE
  -> SETTLING
  -> RUNNING_STAGE
  -> WAITING_FOR_QUIET
  -> COOLDOWN
  -> RECONCILING
  -> COMPLETED

Из любого mutating state:
  -> PAUSED_BY_OPERATOR
  -> AMBIGUOUS_START
  -> DEGRADED
  -> ABORTING
  -> RELEASING
  -> SHUTTING_DOWN
```

Quiet/cooldown timers используют monotonic time внутри процесса. После restart таймер начинается заново, что консервативно и исключает ранний переход из-за изменения wall clock.

### 4.6. Manual и external work

После собственной mutation controller делает read-after-write verification и запоминает committed desired state. Неожиданное изменение `isPaused` после verification считается manual/external override; default — остановка без дальнейших mutations.

User-triggered start из Immich UI:

- в paused очереди создаёт pending work, которую scheduler обработает на её шаге;
- в текущей unpaused очереди присоединяется к текущему stage и сбрасывает quiet timer;
- ручной resume другой managed queue вызывает override stop.

### 4.7. Режим «сначала загрузка, потом обработка»

Это основной пользовательский сценарий проекта, а не частный preset.

Надёжный вариант начинается **до** загрузки:

```text
CAPTURE_BEGIN
  -> сохранить исходные состояния managed queues
  -> поставить processing queues на паузу
  -> CAPTURING_UPLOADS
  -> получить явный CAPTURE_END от пользователя
  -> дождаться upload quiet period
  -> PROCESSING_PASS
  -> восстановить исходные состояния
```

Команда/UI-действие `capture begin` заранее ставит на паузу только allowlist медиаконвейера. Загрузка файлов через Immich при этом продолжает работать, а новые processing jobs накапливаются в paused queues. Уже active job нельзя безопасно прервать через Queue API: pause запрещает выдачу следующей работы, но текущая работа завершается.

Режим `capture watch` может заметить первое увеличение `photos + videos` через `GET /api/server/statistics` либо появление pending jobs и автоматически включить capture. Это best-effort режим с неизбежной гонкой: первый job уже может начать выполняться. Поэтому default и рекомендуемый workflow — нажать `capture begin` перед запуском backup/upload.

Immich не сообщает внешнему контроллеру, сколько файлов пользователь намерен загрузить, и не предоставляет надёжного общего события «весь импорт закончен». Завершение capture имеет три варианта:

1. `capture end` — явный сигнал пользователя; default и самый надёжный вариант.
2. `capture end --expected-assets N` — дополнительно дождаться прироста общего количества assets не менее чем на `N` и quiet period.
3. `autoEndAfter` — opt-in эвристика: количество assets, storage usage и managed queue counters не меняются заданное время. Она может ошибочно завершить capture при длинной паузе сети/телефона и потому выключена по умолчанию.

После capture применяется правило **drain first, repair missing second**:

- если в очереди уже накоплены per-asset jobs от upload pipeline, сначала просто resume и drain;
- `start missing` не вызывается поверх waiting/paused/delayed jobs, потому что большинство QueueAll jobs Immich не дедуплицирует и возможна двойная работа;
- после полного drain допускается один missing-pass как repair/verification для действительно пропущенных assets;
- затем очередь снова ставится на паузу и управление передаётся следующему stage.

Это воспроизводит ручной процесс, но не создаёт лишний QueueAll поверх уже накопившихся заданий.

#### Постоянный Autopilot / guarded idle

Для полностью автоматического домашнего сценария применяется более надёжный вариант `autopilot`, в котором managed processing queues остаются paused даже во время многодневного простоя. Поэтому при появлении первого нового файла нет гонки с первым processing job: очередь уже закрыта заранее.

```text
AUTOPILOT_ARMED / GUARDED_IDLE
  -> обнаружены новые assets или pending jobs
  -> CAPTURING_UPLOADS
  -> каждое новое поступление сбрасывает upload quiet timer
  -> 30 минут без новых поступлений
  -> PROCESSING_PASS по одной очереди
  -> все stages quiet-complete
  -> GUARDED_IDLE, managed queues снова paused
```

Пример: сервер простаивал неделю; началась загрузка 200 файлов; всё время загрузки очереди остаются paused; после последнего нового asset проходит настроенный `autoEndAfter`, например 30 минут; затем backlog обрабатывается полностью автоматически и controller снова переходит в guarded idle.

Детектор поступления опрашивает одновременно:

- `photos + videos` и storage usage через server statistics;
- active/waiting/paused/delayed counters managed queues;
- собственный baseline последнего обработанного/наблюдаемого состояния.

Это polling, а не гарантированное upload-complete event. Если телефон замолчал дольше `autoEndAfter`, обработка может начаться между двумя частями одного импорта. Это безопасно: если во время processing появляется новый upload, controller ставит текущую queue на паузу (уже active job заканчивается), возвращается в `CAPTURING_UPLOADS`, снова ждёт полный quiet period и затем начинает новый согласованный pass с самого раннего необходимого prerequisite.

Чтобы бесконечный поток upload не вызывал постоянное переключение, настраиваются `minimumCaptureTime`, `autoEndAfter` и optional processing windows. Default autopilot profile использует `autoEndAfter: 30m`; пользователь может увеличить значение.

### 4.8. Наблюдение за CPU и load guard

Обычный REST API Immich не возвращает загрузку процессора. Поддерживаются независимые providers:

1. `local-host` — средняя загрузка видимых CPU через системные counters (`os.cpus()`/`/proc/stat`); zero-dependency default, если оркестратор работает на том же хосте/в той же Docker VM.
2. `prometheus` — запрос к уже имеющемуся Prometheus/cAdvisor/node-exporter для host-wide или per-container CPU.
3. `immich-metrics` — прямой scrape opt-in endpoints Immich `:8081/metrics` и `:8082/metrics` при `IMMICH_TELEMETRY_INCLUDE=host,job`. Он полезен для server/API workers, но не считается полной оценкой нагрузки, потому что отдельный `immich-machine-learning` может не входить в эти показатели.

Монтирование Docker socket не требуется и по умолчанию запрещено. Metrics endpoints не нужно публиковать наружу: оркестратор может читать их во внутренней Docker network.

Status показывает current CPU, moving average, peak, текущую очередь и число active/pending jobs. `loadGuard.mode=observe` только предупреждает. Opt-in `loadGuard.mode=throttle` использует hysteresis:

- превышение `pauseAbove` в течение `pauseFor` ставит текущую очередь на паузу;
- уже active job продолжает работу;
- resume разрешается только после `resumeBelow` в течение `resumeFor`;
- потеря обязательного metrics source переводит guard в paused/degraded state, а не трактуется как нулевая нагрузка.

Порог CPU не должен быть универсальным: ffmpeg и ML штатно способны загружать все ядра. Значения подбираются под конкретный сервер; автоматический throttle выключен по умолчанию, пока пользователь не задаст thresholds.

### 4.9. Первый запуск, владение паузами и настройка

Первый запуск нового контейнера всегда безопасный:

- подключиться к Immich и проверить версию/API key;
- прочитать очереди, features и текущую нагрузку;
- показать paused queues как `externally paused / not owned`;
- ничего не pause/resume и не запускать;
- ждать явного действия пользователя.

Если до установки все очереди уже paused вручную, они останутся paused. Кнопка/команда `Process backlog now` создаёт новый run, принимает управление только managed allowlist и последовательно обрабатывает backlog. По завершении default `restore-original` вернёт очереди в их исходное состояние; следовательно, изначально paused очереди снова останутся paused.

Автоматическое продолжение на startup разрешено только в двух случаях:

1. В `/data` существует корректный незавершённый run, ранее созданный этим же controller instance. Тогда выполняется reconciliation и продолжение с безопасной точки.
2. Пользователь заранее включил `scheduled` policy; новый run начинается только внутри заданного окна и после повторной проверки условий.

Наличие paused queues само по себе никогда не означает разрешение на их resume. При повреждённом/потерянном state процесс остаётся read-only и требует решения пользователя.

Уровни автоматизации:

- `observe` — только состояние и CPU, без mutations;
- `manual-session` — пользователь нажимает `Process backlog now`, дальше весь проход автоматический;
- `capture-assisted` — пользователь нажимает только `Capture begin` и `Capture end`, всё остальное автоматизировано;
- `autopilot` — managed queues постоянно guarded/paused, новые upload обнаруживаются автоматически, после периода тишины запускается processing pass;
- `scheduled` — обработка backlog в заданные окна, явный opt-in;
- `capture-watch` — reactive вариант для очередей, которые обычно unpaused; имеет гонку первого job и остаётся experimental.

Конфигурация разделена по назначению:

- `/config/orchestrator.yml`, read-only mount — pipeline, managed queues, порядок, quiet periods, capture/schedule и CPU thresholds;
- Docker secret/file (`IMMICH_API_KEY_FILE`) — API key, без записи секрета в YAML или UI;
- `/data/state.json` и `/data/journal.jsonl` — внутреннее durable state; вручную не редактируется;
- environment variables — только bootstrap overrides (`IMMICH_URL`, пути config/secret, bind address, log level).

Минимальная собственная web-панель должна показывать effective config, очереди, CPU, текущий state/run и содержать только безопасные high-level действия:

- `Capture begin`;
- `Capture end`;
- `Process backlog now`;
- `Pause controller`;
- `Release / restore original`.

Панель не отправляет произвольные queue mutations и не редактирует journal. Mutating actions проходят через ту же state machine и требуют подтверждения. В `auto` пароль панели включается при наличии непустого значения; без него UI явно показывает trusted-network режим. Пароль панели — отдельный login password, не Immich API token.

## 5. Безопасные defaults

```yaml
mode: observe
dryRun: true

control:
  enabled: false
  resumePersistedRun: true
  newInstallAction: wait

api:
  mode: auto
  allowLegacyStart: false
  strictMajorVersion: true

scheduler:
  maxActiveStages: 1
  revisitPolicy: finish-pass
  newWorkPolicy: next-pass
  maxRevisitsPerRun: 0

capture:
  autoBegin: false
  requireExplicitEnd: true
  autoEndAfter: disabled
  uploadQuietPeriod: 60s
  processingPolicy: drain-first-repair-second

autopilot:
  enabled: false
  idlePolicy: guarded
  autoEndAfter: 30m
  minimumCaptureTime: 1m
  newUploadDuringProcessing: pause-after-active-and-recapture

loadGuard:
  mode: observe
  source: local-host
  sampleInterval: 2s
  movingAverageWindow: 30s
  pauseAbove: unset
  resumeBelow: unset

completion:
  pollInterval: 5s
  startSettlePeriod: 10s
  quietPeriod: 30s
  delayedPolicy: wait

recovery:
  startupPolicy: reconcile
  idlePolicy: restore-original
  shutdownPolicy: restore-original
  manualOverridePolicy: stop-controller
  ambiguousStartPolicy: require-operator

safety:
  unknownQueuePolicy: warn
  forceReprocess: false
  allowForceReprocess: false

ml:
  modelTtlHint: 300s
  ttlPollHint: 10s
  cooldownMargin: 15s
```

Mutating mode включается только явно. `force=true` не поддерживается безопасным MVP; двойной opt-in можно добавить позднее вместе с отдельными destructive tests.

## 6. Low-memory preset

```yaml
pipeline:
  - queue: metadataExtraction
    startMissing: true
    resourceGroup: cpu-io

  - queue: storageTemplateMigration
    startMissing: false
    resourceGroup: io

  - queue: thumbnailGeneration
    startMissing: true
    resourceGroup: cpu-io

  - queue: faceDetection
    startMissing: true
    resourceGroup: ml-face

  - queue: facialRecognition
    startMissing: true
    resourceGroup: db-face
    cooldownAfterGroup: auto

  - queue: smartSearch
    startMissing: true
    resourceGroup: ml-clip

  - queue: duplicateDetection
    startMissing: true
    resourceGroup: db-vector
    cooldownAfterGroup: auto

  - queue: ocr
    startMissing: true
    resourceGroup: ml-ocr
    cooldownAfterGroup: auto

  - queue: videoConversion
    startMissing: true
    resourceGroup: transcode
```

Опциональные отдельные operations:

```text
library scan          explicit only
sidecar discovery     explicit only, before metadata
bulk storage migrate explicit maintenance only
file migration        excluded
database backup       excluded
```

При `queued-only` поле `startMissing` полностью игнорируется. При `missing-once` legacy start разрешается только отдельным `allowLegacyStart: true`.

## 7. Безопасный минимальный MVP

### Milestone A — read-only contract prototype

- TypeScript project, lint/typecheck/tests.
- Direct HTTP + Zod schemas.
- Version/feature/capability detection.
- `validate`, `observe`, `status`.
- Effective config endpoint и first-run state без mutations.
- Проверка allowlist/forbidden queues/DAG.
- Никаких mutations и legacy calls.
- Contract fixtures для v3.1.0.

### Milestone B — queued-only controller

- Strict serial scheduler.
- Pause/resume только через Queue API.
- Startup drain уже active jobs.
- Settle + quiet completion.
- Persisted snapshot + action journal.
- Manual override stop.
- Recovery и emergency `release`.
- `capture begin`, `capture status`, `capture end` и optional expected asset count.
- `process backlog now`, controller pause и emergency release commands.
- Guarded-idle autopilot, upload detector и configurable 30-minute quiet timer.
- Возврат в capture при новом upload во время processing без отмены active job.
- Local host CPU sampler, moving average/peak и load status; throttle только явным opt-in.
- HTTP `healthz`, `readyz`, `status`; mutating web endpoints отсутствуют.
- Docker image non-root/read-only, compose example.

### Milestone C — missing-once

- Изолированный legacy start adapter.
- PREPARED/VERIFIED journal protocol.
- `AMBIGUOUS_START` и operator recovery commands.
- Один автоматический start intent на stage/run.
- Drain-first/repair-second: legacy missing запрещён при существующем pending backlog этой очереди.
- Feature-aware stages.
- ML TTL warning/cooldown.
- Integration tests с реальным Immich v3.1.0.

### Milestone D — production hardening

- amd64/arm64 image.
- GHCR, semver/SHA tags.
- SBOM, provenance, signing, vulnerability scanning.
- Compatibility matrix и nightly contract checks.
- Chaos tests: kill -9, API loss, Immich restart, corrupt/full state volume.
- Документация split workers и host resource limits.

### Milestone E — минимальная control panel

- Authenticated status и effective config.
- High-level actions capture/process/pause/release через application service.
- Подтверждение mutating actions и audit trail.
- Пароль web-панели, localhost bind по умолчанию и reverse-proxy contract для LAN.
- Никаких generic queue buttons, config editor, job deletion или Redis access.

Полноценный config editor, notifications и parallel resource groups откладываются до стабильного ядра. Минимальная control panel входит в первый пригодный к эксплуатации release после проверки safety-critical engine. CPU observation входит в Milestone B; Prometheus provider и автоматический load throttling добавляются после проверки local sampler и pause/resume semantics.

## 8. Обновлённые критерии приёмки

### Safety

- Observe/dry-run/validation failure/API error/corrupt state не изменяют очереди.
- Ни одна очередь вне явного allowlist не изменяется.
- `backgroundTask` отклоняется config validator независимо от user config.
- Нет Redis/PostgreSQL writes, Docker socket, container restart и job deletion.
- `force=true` не отправляется.
- Каждый pause/resume имеет durable intent, read-after-write verification и audit reason.
- Ambiguous start никогда не повторяется автоматически.

### Sequence

- После DRAINING не более одной managed queue unpaused.
- Уже active jobs не отменяются.
- Stage не завершается, пока любой из active/waiting/paused/delayed ненулевой.
- Нулевое состояние должно пережить полный quiet period.
- API failure не считается нулевым snapshot.
- Start settle period соблюдается.
- Новая работа сбрасывает quiet timer.
- Dependencies валидируются DAG-ом; cycle и отсутствующий prerequisite блокируют mutation.
- `capture begin` до upload ставит managed processing queues на паузу и не блокирует приём файлов.
- `capture end` без ожидаемого количества требует явного пользовательского сигнала и upload quiet period.
- Missing-pass не запускается, пока в соответствующей queue есть active/waiting/paused/delayed work.
- CPU throttle не пытается отменить active job и использует разные pause/resume thresholds.
- Armed autopilot сохраняет managed queues paused в многодневном guarded idle.
- Каждый новый asset/pending-work signal сбрасывает upload quiet timer.
- После полного upload quiet period autopilot сам начинает serial processing pass.
- Новый upload во время processing останавливает выдачу следующей работы и возвращает controller в capture после завершения active job.

### Recovery

- Restart в observe/idle ничего не меняет.
- Restart во время pause/resume безопасно reconciles idempotent action.
- Restart около legacy start либо находит evidence, либо входит в `AMBIGUOUS_START`.
- Corrupt state не приводит к pause-all/unpause-all.
- Clean shutdown ограниченно пытается применить policy и сохраняет unresolved recovery state при недоступном API.
- `release --restore-snapshot` меняет только managed queues.
- `release --unpause-managed` требует явного выбора и работает без основного loop.
- Первый запуск без persisted run не меняет даже уже paused managed queues.
- Только подтверждённый незавершённый run может автоматически продолжиться после restart.

### Manual/external changes

- Неожиданный pause/resume не перетирается при default policy.
- User-started jobs в paused queue остаются pending до допустимого stage.
- Nightly/new upload jobs видны и не интерпретируются как пустая очередь.
- Starvation не обещается при бесконечном upload stream; есть max run duration и явный incomplete result.

### Compatibility

- v3.1.0 имеет contract fixtures и реальный integration test.
- Unknown major блокирует mutations при strict mode.
- Unknown queue предупреждает и остаётся unmanaged.
- Alpha Queue API и deprecated legacy start явно показаны в status.
- Job inspection никогда не называется полной выборкой.

### Packaging

- non-root, read-only root filesystem, writable только `/data` и tmpfs `/tmp`.
- API key через env или file; redaction в errors/logs.
- multi-stage image, amd64/arm64.
- healthcheck без Docker socket.
- unit/scenario/contract/integration/chaos test suites.
- Apache-2.0 как рекомендуемая лицензия новой clean-room реализации; окончательный выбор фиксируется до первого source commit.

## 9. Решения по открытым вопросам

1. DAG scheduler model, strict serial execution в v1.
2. Idle default: `restore-original`.
3. UI: после v1; в MVP только read-only status.
4. Direct HTTP + Zod.
5. Start после crash: durable intent + evidence; при неоднозначности operator gate.
6. Starvation: finish-pass, next-pass, duration budget; абсолютная гарантия без asset cohort невозможна.
7. Asset cohort: отсутствует в публичном bulk API; не заявлять.
8. Events: polling в v1; публичного надёжного queue-event contract не найдено.
9. ML unload: доказать через публичный API нельзя.
10. Resource groups входят в model сразу, параллелизм позже.
11. CI: fixtures для версий + real container tests для поддерживаемых stable tags.
12. Лицензия: рекомендована Apache-2.0, clean-room, без GPL/AGPL-кода related projects.
13. Admin Tools: отдельный companion, интеграция не нужна ядру.
14. Nightly: раздельные windows + reconciliation external work.
15. External library: отдельная explicit operation.
16. Feature preset: частично через публичный `/server/features`; storage template остаётся явной настройкой.
17. Manual override: observed/desired diff и stop по умолчанию.
18. После успешного run: restore original queue states.
19. Redis diagnostics: нет в v1.
20. После удаления legacy start: заменить только adapter/capability, state machine сохранить.
21. Двухфазный durable action journal: обязателен.
22. Диапазон/asset set: публичного bulk endpoint не найдено; не поддерживать.
23. «Finish current then stop»: полезная CLI policy после ядра queued-only.
24. User-triggered start: принять как external pending work; ручной resume другой queue — override.
25. Pipeline policy и queue-control engine разделены.

## 10. Точка подтверждения

До отдельного подтверждения не создавать package, source code, Dockerfile или workflows. После подтверждения начинать с Milestone A и B, затем подключать legacy start только после прохождения queued-only integration/chaos tests.
