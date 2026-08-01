# Changelog

## 0.2.0 - 2026-08-01

- Changed autopilot and manual runs to scan all enabled Immich missing-work generators before sequential processing.
- Added upload interruption during discovery and processing, followed by a full post-quiet rescan.
- Added per-queue discovered counts, ordering, missing-check switches, and `managed` / `always-running` / `ignored` policies.
- Added sidecar to the nine-queue default pipeline and kept facial recognition after face detection.
- Added optional adaptive quiet time and periodic missing discovery.
- Added validated runtime settings in `/data/settings.json` with atomic, change-only persistence.
- Rebuilt the panel with Overview, Queues, Automation, CPU load, and Advanced tabs.
- Added an explicit release dialog whose default keeps managed queues paused.
- Added QueueAll adoption/reconciliation and regression coverage for inventory, uploads, periodic scans, release behavior, settings, and UI APIs.
- Added safe migration of persisted guarded-idle runs to the current queue list after an upgrade.

## 0.1.5 - 2026-08-01

- Changed the default web panel port from `8080` to the less commonly used port `8005` across the application, container, Compose examples, and documentation.

## 0.1.4 - 2026-08-01

- Renamed the quick-start Immich credential to `ORCHESTRATOR_API_KEY` so services sharing one `.env` do not accidentally share an API key.
- Removed the ambiguous `IMMICH_API_KEY`, `IMMICH_API_KEY_FILE`, and `API_KEY` environment aliases.
- Added a regression test that rejects keys belonging to another service in a shared environment file.

## 0.1.3 - 2026-08-01

- Fixed write permissions for newly created named state volumes while keeping the runtime process non-root.
- Added a Docker CI probe that writes to `/data` with the production security restrictions.
- Simplified the quick start to one `env_file`, one published port, and built-in low-resource defaults.
- Made the panel reachable through the server's LAN and ZeroTier addresses by default.

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
