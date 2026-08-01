# Security policy

<!-- translation-source: SECURITY.md; source-sha256: ac24cd81958c1d33c5690dc5be1afe355d9828f72ceb6d1438d9e5a08d28a01b -->

[English](SECURITY.md)

## Deployment

- Не публикуйте панель в интернет.
- Стандартная строка быстрого запуска `8005:8005` доступна через LAN- и ZeroTier-адреса сервера. В общей сети используйте пароль панели. Чтобы оставить доступ только через ZeroTier, привяжите порт к конкретному ZeroTier-IP сервера; за пределами доверенной сети используйте TLS/auth reverse proxy.
- В простом варианте Immich API key и необязательный пароль панели хранятся в `.env`. В более строгом варианте их можно передать через `ORCHESTRATOR_API_KEY_FILE` и `ORCHESTRATOR_ADMIN_PASSWORD_FILE`.
- Храните реальные значения в `.env`, который исключён из Git и Docker build context; коммитьте только пустой `.env.example`.
- На Linux ограничьте доступ к `.env` командой `chmod 600 .env`.
- Расширенный Compose запускает read-only container без capabilities. Ни одному варианту не нужен Docker socket.
- Ограничьте права каталога `/data`: он содержит operational state, рабочие настройки и audit journal, но не API key или пароль панели.

## Reporting

Сообщайте уязвимости приватно через GitHub Security Advisory этого репозитория. Не прикладывайте реальные API keys, URL библиотеки или state/journal файлы без предварительной очистки.

## Threat boundary

Проект управляет pause/resume и missing-start через отдельный admin API key с пятью документированными разрешениями. В trusted-network режиме пароль панели может быть отключён; это явно отображается в UI и не подходит для публикации в интернет. Если пароль включён, он сравнивается за постоянное время, а повторные ошибки входа ограничиваются по IP. Проект намеренно не имеет доступа к Docker socket, Redis и PostgreSQL.
