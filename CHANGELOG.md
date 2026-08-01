# Changelog

## 0.1.0 - Unreleased

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
