# Security policy

<!-- translation-source: SECURITY.md; source-sha256: dd82fe92a86083f44311a7efddd328a680fc31fa72aecb3be9ab1bd0afa911eb -->

[English](SECURITY.md)

## Deployment

- Не публикуйте панель в интернет.
- Default compose bind — `127.0.0.1`; для доступа только через ZeroTier привяжите опубликованный порт к конкретному ZeroTier-IP сервера. При публикации за пределы доверенной сети используйте пароль панели и TLS/auth reverse proxy.
- В простом варианте Immich API key и необязательный пароль панели хранятся в `.env`. В более строгом варианте их можно передать через `IMMICH_API_KEY_FILE` и `ORCHESTRATOR_ADMIN_PASSWORD_FILE`.
- Храните реальные значения в `.env`, который исключён из Git и Docker build context; коммитьте только пустой `.env.example`.
- На Linux ограничьте доступ к `.env` командой `chmod 600 .env`.
- Запускайте read-only container без capabilities и без Docker socket.
- Ограничьте права каталога `/data`: он содержит operational state и audit journal, но не API key.

## Reporting

Сообщайте уязвимости приватно через GitHub Security Advisory этого репозитория. Не прикладывайте реальные API keys, URL библиотеки или state/journal файлы без предварительной очистки.

## Threat boundary

Проект управляет pause/resume и optional missing-start через admin API key. В trusted-network режиме пароль панели может быть отключён; это явно отображается в UI и не подходит для публикации в интернет. Если пароль включён, он сравнивается за постоянное время, а повторные ошибки входа ограничиваются по IP. Проект намеренно не имеет доступа к Docker socket, Redis и PostgreSQL.
