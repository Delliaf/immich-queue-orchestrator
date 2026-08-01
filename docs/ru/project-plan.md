# План проекта

<!-- translation-source: docs/project-plan.md; source-sha256: ceb2072ddf80c690d8e8f89068d919c36eb6856f88e45ca0d0f8bf8225afbf37 -->

<!-- translation-source: docs/project-plan.md; source-sha256: pending -->

[English](../project-plan.md)

## Статус

Версия `0.2.0` реализует inventory-first workflow и рабочие настройки через панель. Baseline API — Immich `v3.1.0`; queue endpoints нужно повторно проверять для следующих major-версий до включения strict control.

## Цель продукта

Автоматизировать сценарий слабого домашнего сервера:

1. держать тяжёлые очереди на паузе до загрузки;
2. обнаруживать загрузку быстрее 30 секунд и сразу ставить паузу;
3. после тишины запускать все включённые проверки отсутствующих;
4. после discovery снова ставить каждую managed-очередь на паузу и показывать количество;
5. обрабатывать очереди по одной в заданном оператором порядке;
6. начинать полную проверку заново при новой загрузке;
7. возвращаться в guarded idle с опциональной периодической проверкой.

## Safety и ресурсы

- Только публичный HTTP API Immich; без Redis/PostgreSQL и Docker socket.
- Не удалять jobs и не отменять active work.
- Намеренно открывать не больше одной managed-очереди.
- API errors считать неизвестным состоянием, а не пустой очередью.
- Записывать intent до mutation и проверять результат после.
- Не повторять неоднозначный missing start вслепую.
- Уважать ручные изменения в Immich.
- Один Node.js 24 LTS process с heap target 64 MiB.
- CPU sampling только при discovery/processing.
- Guarded-idle polling меньше 30 секунд, более редкий standby polling.
- Запись только при изменении и без child-process healthcheck.

## Реализовано в 0.2.0

- Немедленный discovery при включении автопилота и ручном run.
- Все девять требуемых очередей, включая sidecar и правильный порядок face stages.
- Порядок, missing switch и managed/always-running/ignored policy для каждой очереди.
- Прерывание discovery/processing загрузкой с полной повторной проверкой.
- Опциональные adaptive quiet и periodic discovery.
- Валидируемые persistent settings без записи при отсутствии изменений.
- Панель с вкладками, live found counts и выбором поведения при release.
- Adoption/reconciliation `QueueAll` после restart.
- Regression tests discovery, upload interruption, periodic scans, settings, release behavior и UI API.

## Следующая валидация

- Проверить большую реальную библиотеку Immich и записать timing `QueueAll` каждого stage.
- Проверить upload interruption, restart, API outage, manual override и always-running policy на реальном сервере.
- Измерить idle memory, wakeups и CPU на слабых mini PC.
- Перепроверять endpoint contracts для каждой поддерживаемой major-версии Immich.
- Менять defaults только на основании реальных измерений.

## Acceptance criteria

- Включение над существующей библиотекой находит missing work без предыдущей загрузки.
- Загрузка обнаруживается за заданный интервал и всегда быстрее 30 секунд в guarded idle.
- Каждая включённая очередь проверяется, а inventory показывается до обработки.
- Новая загрузка ставит managed-очереди на паузу и вызывает полный post-quiet rescan.
- Facial recognition не запускается раньше face detection.
- Недельный idle не использует active polling и CPU sampling.
- Неизменившиеся ticks/settings не перезаписывают snapshots.
- Новая установка не продолжает очереди без явной команды оператора.
