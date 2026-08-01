# Security policy

<!-- translation-source: SECURITY.md; source-sha256: 4d46a158b04358f97fef786b9e39a31af6c989234667e36e39be0c1635b2efa7 -->

[English](SECURITY.md)

## Deployment

- Не публикуйте панель в интернет.
- Default compose bind — `127.0.0.1`; при публикации за пределы доверенной сети используйте пароль панели и TLS/auth reverse proxy.
- В простом варианте Immich API key и необязательный пароль панели хранятся в `.env`. В более строгом варианте их можно передать через `IMMICH_API_KEY_FILE` и `ORCHESTRATOR_ADMIN_PASSWORD_FILE`.
- Храните реальные значения в `.env`, который исключён из Git и Docker build context; коммитьте только пустой `.env.example`.
- На Linux ограничьте доступ к `.env` командой `chmod 600 .env`.
- Запускайте read-only container без capabilities и без Docker socket.
- Ограничьте права каталога `/data`: он содержит operational state и audit journal, но не API key.

## Reporting

Сообщайте уязвимости приватно через GitHub Security Advisory этого репозитория. Не прикладывайте реальные API keys, URL библиотеки или state/journal файлы без предварительной очистки.

## Threat boundary

Проект управляет pause/resume и optional missing-start через admin API key. В trusted-network режиме пароль панели может быть отключён; это явно отображается в UI и не подходит для публикации в интернет. Если пароль включён, он сравнивается за постоянное время, а повторные ошибки входа ограничиваются по IP. Проект намеренно не имеет доступа к Docker socket, Redis и PostgreSQL.
