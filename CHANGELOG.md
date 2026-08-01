# Changelog

## 0.1.3 - 2026-08-01

- Fixed write permissions for newly created named state volumes while keeping the runtime process non-root.
- Added a Docker CI probe that writes to `/data` with the production security restrictions.
- Added a configurable host bind address for ZeroTier-only panel access.

## 0.1.2 - 2026-08-01

- Moved the build, runtime image, and CI baseline to Node.js 24 LTS.
- Aligned Node type definitions with the runtime major version.
- Updated ESLint to 10.8.0.
- Prevented automated major jumps for Node, TypeScript, and Node type definitions.

## 0.1.1 - 2026-08-01

- Reorganized the documentation around a complete English reference with companion translations.
- Made the embedded panel English-first with a persistent RU/EN switch.
- Added a development-only translation revision check; it is not included in runtime polling or healthchecks.

## 0.1.0 - 2026-08-01

- Safe observe-first startup.
- Direct validated Immich queue API client.
- Serial queued-only processing and optional drain-first missing repair.
- Durable action journal and restart reconciliation.
- Capture-assisted and guarded-idle autopilot modes.
- Local CPU observation and opt-in hysteresis throttling.
- Authenticated embedded control panel.
- Docker, Compose and GitHub CI/release scaffolding.
- State-aware CPU sampling, adaptive idle polling and change-only state persistence.
- Env-only Compose preset and lightweight external health endpoints without a periodic Node child process.
- Panel credential is consistently presented as a normal login password rather than an API token.
- Secret-mounted Immich key, empty `.env.example`, understandable optional panel password modes and per-IP login rate limiting when authentication is enabled.
