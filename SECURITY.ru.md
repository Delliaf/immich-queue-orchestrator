# Security policy

<!-- translation-source: SECURITY.md; source-sha256: 9f4b13cc7989079e42cc3ec2b4c294a2680aaee3ea80797bd0b5274a4280d590 -->

[English](SECURITY.md)

## Deployment

- Не публикуйте панель в интернет.
- Стандартная строка быстрого запуска `8080:8080` доступна через LAN- и ZeroTier-адреса сервера. В общей сети используйте пароль панели. Чтобы оставить доступ только через ZeroTier, привяжите порт к конкретному ZeroTier-IP сервера; за пределами доверенной сети используйте TLS/auth reverse proxy.
- В простом варианте Immich API key и необязательный пароль панели хранятся в `.env`. В более строгом варианте их можно передать через `IMMICH_API_KEY_FILE` и `ORCHESTRATOR_ADMIN_PASSWORD_FILE`.
- Храните реальные значения в `.env`, который исключён из Git и Docker build context; коммитьте только пустой `.env.example`.
- На Linux ограничьте доступ к `.env` командой `chmod 600 .env`.
- Расширенный Compose запускает read-only container без capabilities. Ни одному варианту не нужен Docker socket.
- Ограничьте права каталога `/data`: он содержит operational state и audit journal, но не API key.

## Reporting

Сообщайте уязвимости приватно через GitHub Security Advisory этого репозитория. Не прикладывайте реальные API keys, URL библиотеки или state/journal файлы без предварительной очистки.

## Threat boundary

Проект управляет pause/resume и optional missing-start через admin API key. В trusted-network режиме пароль панели может быть отключён; это явно отображается в UI и не подходит для публикации в интернет. Если пароль включён, он сравнивается за постоянное время, а повторные ошибки входа ограничиваются по IP. Проект намеренно не имеет доступа к Docker socket, Redis и PostgreSQL.
