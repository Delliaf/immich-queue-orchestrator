# Immich Queue Orchestrator

An independent, safety-oriented controller for Immich background queues on resource-constrained home servers.

> Status: `0.1.0` pre-release. API contracts were validated against Immich `v3.1.0`. Start with `dryRun: true` and keep a backup.

## Highlights

- guarded idle keeps managed processing queues paused before uploads begin;
- configurable upload quiet period, 30 minutes by default;
- strict serial processing with at most one managed queue unpaused;
- drain-first, optional missing-repair-second policy;
- atomic state snapshot and fsynced action journal for restart recovery;
- ambiguous non-idempotent starts require an operator decision and are never retried automatically;
- embedded authenticated control panel with queue, CPU and run status;
- adaptive polling and CPU sampling only during processing phases;
- no Redis/PostgreSQL writes, Docker socket, job deletion, or forced reprocessing.

## Quick start

See the full [Russian README](README.md) and [configuration reference](docs/configuration.md). `compose.simple.yml` is designed to be merged into an existing Immich Compose file. A real `.env` is gitignored and the committed `.env.example` contains no values. Panel authentication defaults to `auto`: an optional non-empty password enables login, while an omitted password selects a clearly indicated trusted-network mode.

The initial configuration uses `dryRun: true` and `allowLegacyStart: false`. Installing or restarting the container does not resume queues on its own. Arm autopilot explicitly after validating the observed version, queues, and effective configuration.

## License

Apache-2.0. This project is not affiliated with or endorsed by the Immich project.
