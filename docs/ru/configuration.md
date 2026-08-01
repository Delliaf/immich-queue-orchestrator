# Конфигурация

<!-- translation-source: docs/configuration.md; source-sha256: a38167ae941b1c8f54990fa64711911267840d762c2837b91ca9bf311546f948 -->

[English](../configuration.md)

В опубликованном image есть встроенный `/app/orchestrator.docker.yml` для простого запуска. Пользовательский `/config/orchestrator.yml` можно подключить read-only и выбрать через `CONFIG_FILE`. Immich API key простой Compose передаёт как mounted secret. Опциональный пароль панели приходит из `.env`; настоящий `.env` не должен попадать в Git.

## Bootstrap environment

| Переменная | Назначение |
|---|---|
| `CONFIG_FILE` | Путь к YAML, default `./orchestrator.yml` локально и `/app/orchestrator.docker.yml` в image |
| `DATA_DIR` | Durable state/journal, default `./data` или `/data` в image |
| `IMMICH_URL` | Override `api.url` |
| `IMMICH_API_KEY_FILE` | Рекомендуемый файл с Immich API key |
| `IMMICH_API_KEY` | Менее безопасный inline secret |
| `API_KEY` | Compose-friendly alias для `IMMICH_API_KEY` |
| `ORCHESTRATOR_ADMIN_PASSWORD_FILE` | Файл с паролем панели |
| `ORCHESTRATOR_ADMIN_PASSWORD` | Пароль панели прямо в environment |
| `ORCHESTRATOR_HOST` / `ORCHESTRATOR_PORT` | Override bind address |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` |
| `POLL_INTERVAL` | Активный polling; число без единицы считается секундами |
| `GUARDED_IDLE_POLL_INTERVAL` | Детектор новых загрузок; обязательно меньше 30 секунд |
| `STANDBY_POLL_INTERVAL` | Polling без вооружённого автопилота |
| `UPLOAD_QUIET_PERIOD` | Период тишины автопилота, например `30m` |
| `ALLOW_LEGACY_START` | `true/false`, включает missing repair-pass |

Пароль панели не является API token и по умолчанию необязателен. Никаких требований к длине или составу нет. Пароль не печатается в логах и не сохраняется в `/data`. Для простого домашнего запуска используется `ORCHESTRATOR_ADMIN_PASSWORD`; для более строгой установки доступен `ORCHESTRATOR_ADMIN_PASSWORD_FILE`.

`server.authentication` определяет поведение:

- `auto` — пароль включается, только если передано непустое значение;
- `password` — пароль обязателен, отсутствие останавливает запуск;
- `none` — вход по паролю принудительно отключён, даже если переменная задана.

При включённом пароле после пяти неверных попыток один IP блокируется на пять минут. Браузер хранит пароль только в `sessionStorage` текущей вкладки. Без пароля панель показывает предупреждение о trusted-network режиме.

## Разрешения Immich API key

Ключ должен принадлежать учётной записи администратора, поскольку queue и server statistics endpoints требуют admin context. Не выбирайте «все разрешения».

Минимум для безопасной обработки уже созданных jobs:

- `queue.read`;
- `queue.update`;
- `server.statistics`.

Если включён `ALLOW_LEGACY_START=true` или `api.allowLegacyStart: true`, дополнительно нужны:

- `job.create` — команда «проверить отсутствующие»;
- `queueJob.read` — поиск доказательства выполненного start после сетевого сбоя или restart.

`queueJob.delete`, `job.read`, asset permissions и доступ ко всем API проекту не нужны.

## Safety switches

```yaml
dryRun: true
control:
  enabled: true
api:
  allowLegacyStart: false
```

- `dryRun: true` блокирует все mutations даже при нажатии кнопок.
- `control.enabled: false` полностью отключает управление.
- `allowLegacyStart: false` оставляет только queued-only обработку.
- `strictMajorVersion: true` блокирует mutations на неизвестной major-версии Immich.

## Autopilot

```yaml
autopilot:
  available: true
  autoEndAfter: 30m
  minimumCaptureTime: 1m
  newUploadDuringProcessing: pause-after-active-and-recapture
```

В armed autopilot все managed queues остаются globally paused в idle. Детектор использует `photos + videos`, storage usage и pending counters. Это polling-эвристика: пауза телефона длиннее `autoEndAfter` может разделить импорт на два безопасных прохода.

Polling адаптивный: по умолчанию 5 секунд при активной обработке, 10 секунд в `GUARDED_IDLE` и 30 секунд без активного run. Таким образом начало загрузки обнаруживается раньше 30 секунд, но недельный простой не создаёт пятисекундных пробуждений.

## Completion

Stage считается завершённым, только если одновременно равны нулю:

```text
active + waiting + paused + delayed
```

Ноль должен сохраняться весь `scheduler.quietPeriod`. API error никогда не преобразуется в нулевой snapshot.

## CPU

```yaml
loadGuard:
  mode: observe
  sampleInterval: 2s
  movingAverageWindow: 30s
```

`local-host` использует видимые контейнеру системные CPU counters. В Docker Desktop это нагрузка Linux VM. Для автоматического throttling:

CPU sampling выключен в standby, `GUARDED_IDLE` и `CAPTURING_UPLOADS`. Он включается только в processing phases, где его результат способен приостановить выдачу jobs; при остановке накопленная выборка очищается.

```yaml
loadGuard:
  mode: throttle
  pauseAbove: 90
  pauseFor: 30s
  resumeBelow: 65
  resumeFor: 60s
```

`resumeBelow` обязан быть ниже `pauseAbove`. Pause не отменяет active job, а только останавливает выдачу следующих jobs.

## Pipeline

Pipeline — валидируемый DAG, но scheduler `0.1.0` выполняет его строго последовательно. `feature` связывает stage с `/api/server/features`. Отключённая функция удаляет соответствующий stage из run.

Нельзя добавлять в managed list системные queues: `backgroundTask`, `migration`, `search`, `notifications`, `backupDatabase`, `workflow`, `integrityCheck`, `editor`.

`library` и `sidecar` намеренно отсутствуют в стандартном preset. Они требуют отдельных explicit maintenance operations, которых пока нет.
