# Восстановление

<!-- translation-source: docs/recovery.md; source-sha256: 166570b3006d3b0edd552b01f4215aadbfb0a21f3be0107f6801a7944e85b65b -->

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
