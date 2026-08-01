# Конфигурация

<!-- translation-source: docs/configuration.md; source-sha256: 407a6bdea9448c11e22a53177b4091899bd9c5fb596b9d5b233f5cd8db608664 -->

<!-- translation-source: docs/configuration.md; source-sha256: pending -->

[English](../configuration.md)

В опубликованном image есть `/app/orchestrator.docker.yml` с начальными настройками для домашнего сервера. Большинство рабочих параметров меняется в web-панели и хранится в `/data/settings.json`. Секреты, URL Immich, bind address, порт, проверка версии и безопасность первого запуска остаются в environment/YAML.

## Начальные переменные environment

| Переменная | Назначение |
|---|---|
| `CONFIG_FILE` | Путь к YAML; в image используется `/app/orchestrator.docker.yml` |
| `DATA_DIR` | Состояние, journal и рабочие настройки; в image `/data` |
| `IMMICH_URL` | URL API Immich |
| `ORCHESTRATOR_API_KEY` | Отдельный API key Immich для этого приложения |
| `ORCHESTRATOR_API_KEY_FILE` | Необязательный файл с ключом |
| `ORCHESTRATOR_ADMIN_PASSWORD` | Необязательный обычный пароль панели |
| `ORCHESTRATOR_ADMIN_PASSWORD_FILE` | Необязательный файл с паролем панели |
| `ORCHESTRATOR_HOST` / `ORCHESTRATOR_PORT` | Bind address и порт |
| `LOG_LEVEL` | `debug`, `info`, `warn` или `error` |
| `POLL_INTERVAL` | Начальный интервал активного polling |
| `GUARDED_IDLE_POLL_INTERVAL` | Начальный интервал детектора загрузки, меньше 30 секунд |
| `STANDBY_POLL_INTERVAL` | Начальный polling без вооружённого автопилота |
| `UPLOAD_QUIET_PERIOD` | Начальный период тишины, например `30m` |
| `ALLOW_LEGACY_START` | Совместимость с bulk missing endpoint Immich; встроенный default `true` |

Простой Compose читает `ORCHESTRATOR_API_KEY` и необязательный пароль из существующего `.env` Immich. Не добавляйте настоящий `.env` в Git. Для установки с файловыми secrets доступны варианты `_FILE`.

`server.authentication: auto` включает вход только при непустом пароле. Режим `password` требует пароль, `none` явно отключает вход. Требований к длине и составу нет. После пяти неверных попыток IP блокируется на пять минут. Панель без пароля должна оставаться в доверенной сети.

Стандартный mapping `8005:8005` открывает панель через LAN- и ZeroTier-адрес сервера. Для доступа только через ZeroTier укажите `<zerotier-ip-сервера>:8005:8005`, для local/reverse proxy — `127.0.0.1:8005:8005`.

## Разрешения API key Immich

Создайте отдельный ключ от учётной записи администратора Immich. Не выбирайте все разрешения. Нужны только:

- `queue.read` — счётчики и pause state;
- `queue.update` — pause/resume;
- `server.statistics` — обнаружение новых фото и видео;
- `job.create` — запуск каждой проверки отсутствующих с `force=false`;
- `queueJob.read` — наблюдение за `QueueAll` и восстановление после неоднозначного запроса.

`queueJob.delete`, `job.read`, разрешения assets и полный доступ ко всему API не требуются.

## Рабочие настройки

Основной редактор — панель. Она валидирует и атомарно записывает `/data/settings.json`; сохранение тех же значений не пишет на диск. Начальный YAML задаёт defaults только до появления этого файла.

### Очереди

У каждой очереди есть порядок, переключатели «Проверять отсутствующие» и «Стабилизировать счётчик», а также один режим:

- `managed` — пауза во время загрузки/ожидания и последовательная обработка;
- `always-running` — оркестратор держит очередь запущенной и не ставит её на паузу после этапа;
- `ignored` — очередь не меняется и не входит в run.

Порядок по умолчанию: `thumbnailGeneration`, `metadataExtraction`, `sidecar`, `smartSearch`, `duplicateDetection`, `faceDetection`, `facialRecognition`, `ocr`, `videoConversion`. Все они managed и проверяют отсутствующие. Стабилизация счётчика по умолчанию включена для metadata extraction, sidecar, duplicate detection и facial recognition. Распознавание лиц должно оставаться после обнаружения лиц.

Не добавляйте системные очереди `backgroundTask`, `migration`, `search`, `notifications`, `backupDatabase`, `workflow`, `integrityCheck` и `editor`. `storageTemplateMigration` также запрещена: это отдельная долгая последовательная операция перемещения файлов, а не обычная missing-media обработка.

### Автоматизация

| Настройка | Поведение по умолчанию |
|---|---|
| Проверка при включении автопилота | Включена |
| Проверка при ручном запуске | Включена |
| Приоритет обработки | Заданный порядок; опционально сначала минимальный стабильный остаток |
| Тишина после загрузки | 30 минут |
| Адаптивное ожидание | Выключено; при включении добавляет время за каждый новый asset до максимума |
| Периодическая проверка | Выключена; можно задать 1–720 часов в armed idle |
| Ожидание быстрого discovery | 10 секунд |
| Timeout discovery | 10 минут на очередь |
| Показ инвентаризации | 5 секунд |
| Стабилизация временного счётчика | Включена для выбранных queues; окна 15 секунд, падение минимум 20%, максимум 2 минуты |
| Active poll | 5 секунд |
| Guarded-idle poll | 10 секунд и всегда меньше 30 секунд |
| Standby poll | 30 секунд |
| Подтверждение пустой очереди | 30 секунд |

Загрузка во время discovery или обработки немедленно ставит managed-очереди на паузу. После периода тишины прежняя инвентаризация сбрасывается и все включённые очереди проверяются заново. Периодическая проверка запускает тот же scan-and-process даже без загрузок.

В режиме «сначала минимальный стабильный остаток» stages топологически перестраиваются после discovery. Сначала идёт минимальная готовая очередь, но dependency всегда остаётся раньше; поэтому facial recognition не опережает face detection.

Во время стабилизации выбранная очередь остаётся открытой, пока созданный счётчик быстро уменьшается. Каждое окно сравнивает pending count с предыдущей выборкой. Наблюдение продолжается только при достаточном проценте падения и заканчивается на стабильном значении, нуле или maximum duration. Начальный всплеск и стабильный остаток сохраняются для панели.

### CPU load guard

`off` не считывает CPU. `observe` включает sampling только при discovery/processing, когда нагрузка полезна в панели. `throttle` дополнительно приостанавливает dispatch после устойчивой высокой нагрузки и продолжает после устойчивой низкой. Moving-average window должен быть не меньше sample interval, а порог resume — ниже порога pause.

В standby, guarded idle и при загрузке CPU sampling по умолчанию выключен. Переключатель «Показывать CPU в простое» включает sampling в unarmed и guarded idle через уже существующий in-process sampler с заданным интервалом, но это естественно добавляет фоновые пробуждения. При upload capture sampling всё равно выключается. В image нет отдельного периодического Node.js healthcheck process.

## Начальные safety switches

```yaml
dryRun: false
control:
  enabled: true
  newInstallAction: wait
api:
  allowLegacyStart: true
  strictMajorVersion: true
```

- `dryRun: true` блокирует mutations очередей Immich и run actions; локальные рабочие настройки всё равно можно заранее сохранить в панели.
- `control.enabled: false` полностью отключает управление.
- `newInstallAction: wait` не позволяет новой установке трогать очереди до явной команды.
- `allowLegacyStart: false` отключает missing discovery и нужен только как fallback совместимости.
- `strictMajorVersion: true` блокирует mutations для неизвестной major-версии Immich.

## Завершение очереди

Очередь считается пустой, только если `active + waiting + paused + delayed` остаётся равным нулю весь заданный период подтверждения. API error всегда означает неизвестное состояние, а не пустую очередь.
