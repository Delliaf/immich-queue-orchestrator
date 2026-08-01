# Восстановление

<!-- translation-source: docs/recovery.md; source-sha256: cc560220bfed94814d15a2c8d8f671d4f02798e5b6d54eb3beefd999e7416a64 -->

[English](../recovery.md)

## Restart контейнера

- Без persisted run: только observe, очереди не изменяются.
- С собственным незавершённым run и `resumePersistedRun: true`: journal reconciliation и продолжение.
- С corrupt state: read-only, исправление только вручную после резервной копии файлов `/data`.

## Manual override

Если пользователь меняет pause/resume в Immich UI и observed state отличается от committed desired state, controller переходит в `PAUSED_BY_OPERATOR`. Он не борется с пользователем каждые пять секунд.

Действия:

- «Продолжить контроллер» — принять текущий run и продолжить;
- «Освободить управление» — восстановить queue states, сохранённые в начале run, и удалить активное владение.

## AMBIGUOUS_START

Возникает, если `PUT /api/jobs/{queue}` мог дойти до Immich, но подтверждение не получено или процесс погиб до durable commit.

Панель предлагает:

- `assume-sent`: считать start доставленным и наблюдать очередь;
- `retry-start`: явное разрешение оператора на потенциальный повтор;
- `abort`: восстановить исходные queue states и завершить run.

Перед решением проверьте Immich Jobs UI. Автоматического retry нет.

## API недоступен

Ошибка poll не означает пустую очередь. Controller сохраняет state и повторяет read-only poll; новые mutations не выполняются, пока observation не восстановлен. Health endpoint остаётся доступен, readiness становится false.

## Резервное копирование

Сохраняйте volume `/data` вместе с конфигурацией. API key и, если используется, пароль панели резервируются отдельно как secrets. Не редактируйте `journal.jsonl` во время работы контейнера.

## Ошибка прав state volume

Начиная с `0.1.3` новые named volumes получают владельца непривилегированного runtime-пользователя. Если volume создан предыдущим релизом, а в логах есть `EACCES` для `/data/journal.jsonl`, остановите сервис и один раз исправьте владельца именно этого volume:

```bash
docker compose stop immich-queue-orchestrator
docker run --rm --user root \
  -v <имя-compose-volume>:/data \
  ghcr.io/delliaf/immich-queue-orchestrator:latest \
  chown -R node:node /data
docker compose up -d immich-queue-orchestrator
```

Точное имя получите через `docker volume ls`; не подставляйте непроверенный volume.
