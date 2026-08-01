# Immich Queue Orchestrator

[English summary](README.en.md)

Безопасный внешний контроллер фоновых очередей Immich для домашних серверов с ограниченными CPU и RAM.

> Статус: pre-release `0.1.0`. Контракты проверены по Immich `v3.1.0`. До первого запуска на реальной библиотеке используйте `dryRun: true` и сделайте резервную копию.

## Что он делает

- оставляет тяжёлые processing queues на паузе во время загрузки файлов;
- обнаруживает новые assets и ждёт настраиваемый период тишины, по умолчанию 30 минут;
- запускает обработку строго по одной очереди;
- сначала дренирует накопившиеся jobs и только потом, опционально, делает один missing repair-pass;
- показывает очереди, текущий этап и CPU в собственной web-панели;
- восстанавливается после restart через атомарный state и append-only action journal;
- при неоднозначном legacy start останавливается и спрашивает решение оператора;
- никогда не пишет напрямую в Redis или PostgreSQL и не требует Docker socket.

## Сценарий автопилота

```text
GUARDED_IDLE (managed queues paused)
  -> появились новые фото/видео
  -> CAPTURING_UPLOADS
  -> 30 минут без новых поступлений
  -> metadata -> storage -> thumbnails -> ML/OCR/video
  -> GUARDED_IDLE
```

Если загрузка возобновилась во время обработки, текущий active job заканчивается, выдача следующей работы приостанавливается и снова начинается upload quiet timer.

## Простой запуск в существующем Docker Compose Immich

После публикации образа достаточно добавить один сервис под существующий `services:`:

```yaml
  immich-queue-orchestrator:
    container_name: immich_queue_orchestrator
    image: ghcr.io/delliaf/immich-queue-orchestrator:latest
    environment:
      IMMICH_URL: http://immich-server:2283
      IMMICH_API_KEY_FILE: /run/secrets/immich_api_key
      # Необязательно: пустое значение отключает вход по паролю.
      ORCHESTRATOR_ADMIN_PASSWORD: ${IMMICH_QUEUE_ORCHESTRATOR_ADMIN_PASSWORD:-}
      UPLOAD_QUIET_PERIOD: "30m"
      POLL_INTERVAL: "5"
      GUARDED_IDLE_POLL_INTERVAL: "10"
      ALLOW_LEGACY_START: "false"
      NODE_OPTIONS: --max-old-space-size=64
    volumes:
      - immich_queue_orchestrator_data:/data
    secrets:
      - immich_api_key
    ports:
      - 127.0.0.1:8080:8080
    depends_on:
      immich-server:
        condition: service_healthy
    restart: unless-stopped
    init: true
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    tmpfs:
      - /tmp:size=16m,noexec,nosuid,nodev
    mem_limit: 192m
    cpus: 0.25
```

В существующие верхнеуровневые разделы `volumes:` и `secrets:` добавьте:

```yaml
volumes:
  immich_queue_orchestrator_data:

secrets:
  immich_api_key:
    environment: IMMICH_QUEUE_ORCHESTRATOR_API_KEY
```

Скопируйте безопасный шаблон и заполните значения:

```bash
cp .env.example .env
chmod 600 .env
```

```dotenv
IMMICH_QUEUE_ORCHESTRATOR_API_KEY=отдельный_API_ключ_Immich
# Необязательно. Оставьте пустым, если пароль в доверенной домашней сети не нужен.
IMMICH_QUEUE_ORCHESTRATOR_ADMIN_PASSWORD=
```

По умолчанию используется `server.authentication: auto`:

- переменная отсутствует или пуста — панель открывается без пароля;
- указано любое непустое значение — панель запрашивает этот пароль;
- требований к длине, цифрам или специальным символам нет.

Это обычный пароль нашей панели, не API token и не ключ Immich. Настоящий `.env` исключён из Git и Docker build context; в репозитории остаётся только пустой `.env.example`. Если пароль не используется, панель показывает заметное предупреждение. Не публикуйте такой режим в интернет.

Затем выполните `docker compose up -d immich-queue-orchestrator`, откройте `http://127.0.0.1:8080`, при необходимости введите настроенный пароль панели и один раз нажмите «Включить автопилот». В armed idle управляемые очереди уже стоят на паузе, а появление загрузки обнаруживается обычно за 10 секунд и гарантированно настраивается ниже 30 секунд. Armed state хранится в named volume и переживает перезапуски.

Пока GHCR-образ ещё не опубликован, используйте `build: .` вместо `image:` из локальной копии проекта. Готовый фрагмент находится в [`compose.simple.yml`](compose.simple.yml).

`MAX_CONCURRENT_JOBS` этому сервису не нужен: он держит открытой только одну managed queue. Количество одновременно исполняемых jobs внутри этой очереди задаёт сам Immich.

`ALLOW_LEGACY_START=false` сначала обрабатывает только уже созданные jobs. После проверки на своей версии Immich его можно переключить в `true`, чтобы включить последовательный «проверить отсутствующие» repair-pass.

## Расширенный запуск с отдельным YAML

1. Создайте отдельный API key в учётной записи администратора Immich. Для queued-only нужны только `queue.read`, `queue.update`, `server.statistics`. Для missing repair дополнительно нужны `job.create` и `queueJob.read` (последний используется для безопасного восстановления после неоднозначного start).
2. Скопируйте конфигурацию:

   ```bash
   cp orchestrator.example.yml orchestrator.yml
   mkdir -p secrets orchestrator-data
   printf '%s' 'IMMICH_API_KEY' > secrets/immich_api_key.txt
   printf '%s' 'ВАШ_ПАРОЛЬ_ПАНЕЛИ' > secrets/orchestrator_admin_password.txt
   ```

3. Подключите сервис к той же Docker network, где доступен `immich-server`, и запустите:

   ```bash
   docker compose -f compose.example.yml up -d --build
   ```

4. Откройте панель через SSH tunnel или на самом сервере: `http://127.0.0.1:8080`. Введите пароль панели.
5. Первый запуск оставьте с `dryRun: true`: проверьте версию, queues и effective config.
6. Для управления установите `dryRun: false`, пересоздайте контейнер и нажмите «Включить автопилот».

Сам факт установки или restart контейнера не снимает существующие паузы. Новый install ждёт явной команды. Автоматически продолжается только собственный persisted run.

## Режимы

- `observe`: только состояние и CPU;
- `manual-session`: одна команда «Обработать накопившееся», затем автоматический проход;
- `capture-assisted`: ручные «Начать приём» и «Загрузка закончена»;
- `autopilot`: постоянный guarded idle, автоматический детектор загрузки и processing pass;
- `scheduled`: зарезервирован конфигурацией; scheduling loop ещё не включён в `0.1.0`.

## Безопасность missing repair

`allowLegacyStart` по умолчанию выключен. Без него контроллер обрабатывает только jobs, уже созданные Immich.

При включении repair-pass:

1. очередь сначала должна стать полностью пустой по `active + waiting + paused + delayed`;
2. выполняется один `force=false` start;
3. сетевой сбой около start считается неоднозначным;
4. автоматического retry нет — решение принимается в панели.

## Документация

- [Конфигурация](docs/configuration.md)
- [Архитектура и state machine](docs/architecture.md)
- [Восстановление и аварийные действия](docs/recovery.md)
- [Совместимость с Immich](docs/compatibility.md)
- [Безопасность](SECURITY.md)
- [Разработка](CONTRIBUTING.md)
- [Проверенный проектный план](VALIDATED_PROJECT_PLAN_RU.md)

## Лицензия

Apache License 2.0. Immich — отдельный проект; данный репозиторий не является официальной частью Immich.
