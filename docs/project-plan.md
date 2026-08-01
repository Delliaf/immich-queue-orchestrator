# Project plan

[Русская версия](ru/project-plan.md)

## Status

Version `0.1.1` implements the minimum safe orchestrator and is published for `linux/amd64` and `linux/arm64`. The API contract baseline is Immich `v3.1.0`. Compatibility with queue endpoints must be revalidated for later Immich major versions before strict control is enabled.

## Product goal

Provide the manual workflow used on small home servers as a lightweight, recoverable controller:

1. keep heavy queues paused before uploads begin;
2. detect uploads within 30 seconds;
3. wait for the configured quiet period;
4. drain one processing queue at a time;
5. optionally run one missing-jobs repair pass only after the backlog is empty;
6. return to guarded idle.

## Non-negotiable safety rules

- Use only the public Immich HTTP API.
- Never write directly to Redis or PostgreSQL.
- Never require the Docker socket.
- Never delete jobs or force reprocessing by default.
- Keep at most one managed queue unpaused.
- Treat an API error as unknown state, never as an empty queue.
- Persist intent before a mutation and verify observed state afterward.
- Never retry an ambiguous non-idempotent start automatically.
- Respect manual changes made in the Immich UI.

## Resource model

- One Node.js process with a 64 MiB heap target.
- Adaptive polling: active, guarded-idle, and standby intervals.
- CPU sampling only while processing, when the sample can affect dispatch.
- Change-only state persistence to avoid unnecessary disk writes.
- No periodic Node.js child process for Docker healthchecks.
- Default Compose limits: `192m` memory and `0.25` CPU.

## Delivered in 0.1.0

- Validated Immich queue client and runtime response schemas.
- Observe-first startup and explicit autopilot arming.
- Guarded upload capture with a configurable quiet period.
- Serial pipeline with drain-first missing repair.
- Durable state snapshot and append-only action journal.
- Restart reconciliation and ambiguous-start operator decisions.
- Manual override detection and release-control behavior.
- Embedded panel with optional password authentication and rate limiting.
- CPU observation and opt-in hysteresis throttling.
- Hardened Docker and Compose examples.
- Automated tests, Docker CI, multi-architecture releases, provenance, and Dependabot.

## Next milestones

### Compatibility hardening

- Test against every supported Immich release line.
- Record endpoint changes and validated source snapshots.
- Add fixtures for any new queue response variants.

### Operational validation

- Run dry-run observation against a real library.
- Exercise upload interruption, container restart, API outage, and manual override scenarios.
- Measure idle wakeups and memory on representative low-power mini PCs.

### Release maturity

- Promote defaults only after real-library validation.
- Publish upgrade and rollback notes for every behavior-changing release.

## Acceptance criteria

- Upload activity is detected within the configured interval and always below 30 seconds in guarded idle.
- Processing never intentionally opens more than one managed queue.
- Restart recovery does not duplicate an ambiguous legacy start.
- A week of idle operation does not perform active-rate polling or CPU sampling.
- Unchanged ticks do not rewrite durable state.
- A new installation never resumes pre-existing queues without an explicit operator command.
- The public container can be pulled anonymously on both supported architectures.
