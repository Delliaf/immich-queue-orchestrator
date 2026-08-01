# Architecture

[Русская версия](ru/architecture.md)

```text
Web panel / HTTP actions
          |
          v
Application service + serial executor
          |
          v
Reconciliation state machine
     |               |
     v               v
state.json       journal.jsonl
          |
          v
Validated Immich HTTP adapters
```

## Boundaries

- Public Immich HTTP API only.
- No Redis or PostgreSQL writes.
- No Docker socket, container restarts, or job deletion.
- At most one managed queue is unpaused during a processing pass.
- Unknown queues remain unmanaged and are shown in status output.

## Main states

```text
IDLE -> PREPARING
     -> GUARDED_IDLE -> CAPTURING_UPLOADS -> PROCESSING
     -> RUNNING_STAGE <-> WAITING_FOR_QUIET
     -> COMPLETED | GUARDED_IDLE

Any managed pass can stop in:
PAUSED_BY_OPERATOR | AMBIGUOUS_START | DEGRADED | RELEASING
```

## Durable mutation protocol

Pause and resume operations follow this sequence:

```text
PREPARED (fsync) -> API call -> read-response verification -> VERIFIED -> COMMITTED
```

After a crash, an idempotent action is reconciled against observed state. If state matches `before`, the action is retried; if it matches `desired`, the action is committed. A third state is treated as an external override.

A legacy start is not idempotent. After an unclear network result, the controller does not retry. It searches for QueueAll evidence with a timestamp no older than the prepared action and enters `AMBIGUOUS_START` when the evidence is insufficient.

## State storage

- `state.json`: temporary write, file fsync, atomic rename, and directory fsync where supported.
- `journal.jsonl`: append and fsync for every mutation phase.
- Corrupt state is never overwritten; the service switches to read-only mode.
- All actions are serialized inside the process.
- An unchanged tick does not rewrite `state.json`; CPU hysteresis is persisted only when a timer or throttled state changes.

## Upload priority

Armed autopilot keeps queues paused before the first file arrives. This removes the race to pause processing after the first job appears. If uploading starts during processing, the controller pauses dispatch, waits for the active job, and returns to the capture quiet timer.

## Idle resource policy

- Active processing polls Immich every 5 seconds.
- `GUARDED_IDLE` polls every 10 seconds, keeping upload detection below 30 seconds.
- Standby without an active run polls every 30 seconds.
- CPU sampling exists only during processing phases.
- The Docker image does not run a separate Node.js healthcheck process; `/healthz` and `/readyz` remain available to external monitoring.
