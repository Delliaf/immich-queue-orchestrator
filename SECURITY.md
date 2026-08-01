# Security policy

## Deployment

- Не публикуйте панель в интернет.
- Default compose bind — `127.0.0.1`; при публикации за пределы доверенной сети используйте пароль панели и TLS/auth reverse proxy.
- Передавайте Immich API key через Docker secret. Для строгой установки пароль панели также можно передать через `ORCHESTRATOR_ADMIN_PASSWORD_FILE`.
- Храните реальные значения в `.env`, который исключён из Git и Docker build context; коммитьте только пустой `.env.example`.
- На Linux ограничьте доступ к `.env` командой `chmod 600 .env`.
- Запускайте read-only container без capabilities и без Docker socket.
- Ограничьте права каталога `/data`: он содержит operational state и audit journal, но не API key.

## Reporting

До появления публичного security advisory process сообщайте уязвимости владельцу репозитория приватным GitHub Security Advisory. Не прикладывайте реальные API keys, URL библиотеки или state/journal файлы без предварительной очистки.

## Threat boundary

Проект управляет pause/resume и optional missing-start через admin API key. В trusted-network режиме пароль панели может быть отключён; это явно отображается в UI и не подходит для публикации в интернет. Если пароль включён, он сравнивается за постоянное время, а повторные ошибки входа ограничиваются по IP. Проект намеренно не имеет доступа к Docker socket, Redis и PostgreSQL.
