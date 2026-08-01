# Security policy

[Русская версия](SECURITY.ru.md)

## Deployment

- Do not expose the panel directly to the internet.
- The default Compose bind address is `127.0.0.1`. Outside a trusted network, use a panel password and a TLS/authentication reverse proxy.
- The simple setup keeps the Immich API key and optional panel password in `.env`. A stricter setup can pass them through `IMMICH_API_KEY_FILE` and `ORCHESTRATOR_ADMIN_PASSWORD_FILE`.
- Keep real values in `.env`, which is excluded from Git and the Docker build context. Commit only the empty `.env.example`.
- On Linux, restrict `.env` with `chmod 600 .env`.
- Run the read-only container without capabilities or Docker socket access.
- Restrict access to `/data`. It contains operational state and the audit journal, but not the API key.

## Reporting

Report vulnerabilities privately through a GitHub Security Advisory for this repository. Do not attach real API keys, library URLs, or state/journal files unless they have been sanitized.

## Threat boundary

The project controls pause/resume and the optional missing-job start through an administrator API key. Panel authentication can be disabled in trusted-network mode; the UI clearly identifies that mode, and it is unsuitable for internet exposure. When a password is enabled, it is compared in constant time and repeated failures are rate-limited by IP. The project deliberately has no access to the Docker socket, Redis, or PostgreSQL.
