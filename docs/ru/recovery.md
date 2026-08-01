# Восстановление

<!-- translation-source: docs/recovery.md; source-sha256: 0ea2cb50031923ff8c835ff8dd47cd076e425455f0548ab1b4facb9110b3d16b -->

<!-- translation-source: docs/recovery.md; source-sha256: pending -->

[English](../recovery.md)

## Restart контейнера

- Нет persisted run: только наблюдение, очереди не меняются.
- Есть незавершённый owned run и `resumePersistedRun: true`: journal сверяется и работа продолжается.
- Discovery generator ещё существует: он принимается без повторного start.
- В guarded-idle run сохранён старый список queues: безопасные idle stages перестраиваются и сразу запускается новая инвентаризация.
- Повреждён `state.json`: файл сохраняется, контроллер становится read-only до ручного backup/repair.
- Нет или повреждён `settings.json`: startup завершается ошибкой валидации, а настройки оператора не заменяются молча.

## Прерывание загрузкой

Загрузка во время discovery, показа инвентаризации или processing немедленно ставит managed-очереди на паузу. Уже active generator `QueueAll` может закончиться. После upload quiet period старая инвентаризация сбрасывается и все включённые очереди сканируются заново; после принятого прерванного generator выполняется ещё одна свежая проверка.

## Ручное изменение

Если пользователь меняет очередь в Immich и наблюдаемое состояние отличается от committed desired state, контроллер переходит в `PAUSED_BY_OPERATOR`, а не спорит с пользователем.

- «Продолжить контроллер» принимает текущий run и продолжает.
- «Отпустить управление» каждый раз спрашивает: оставить managed-очереди на паузе или восстановить состояния, сохранённые в начале run. По умолчанию выбрана пауза.

## Неоднозначный missing start

`PUT /api/jobs/{queue}` неидемпотентен. Если запрос мог дойти до Immich, но нет убедительного ответа или подходящего по времени `QueueAll`, контроллер останавливается в `AMBIGUOUS_START`.

- `assume-sent` — считать запрос доставленным и наблюдать очередь;
- `retry-start` — явно разрешить потенциально повторный запрос;
- `abort` — закончить run и отпустить управление выбранным способом.

Перед решением проверьте Jobs UI Immich. Автоматического retry нет.

## API недоступен

Ошибка чтения никогда не означает пустую очередь. Контроллер сохраняет state, прекращает новые mutations и повторяет observation. `/healthz` остаётся доступным, а `/readyz` сообщает degraded state.

## Резервная копия

Копируйте volume `/data`: там находятся `state.json`, `journal.jsonl` и `settings.json`, но нет API key или пароля панели. `.env`/mounted secrets копируйте отдельно. Не редактируйте файлы при работающем контейнере.

## Ошибка прав volume

Новые named volumes инициализируются для non-root runtime user. Если старый volume выдаёт `EACCES`, остановите сервис и один раз исправьте именно этот заранее проверенный volume:

```bash
docker compose stop immich-queue-orchestrator
docker run --rm --user root \
  -v <compose-volume-name>:/data \
  ghcr.io/delliaf/immich-queue-orchestrator:latest \
  chown -R node:node /data
docker compose up -d immich-queue-orchestrator
```

Точное имя получите через `docker volume ls`; не подставляйте непроверенный volume.
