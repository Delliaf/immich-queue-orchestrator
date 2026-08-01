# Architecture

[Русская версия](ru/architecture.md)

```text
Web panel / HTTP actions
          |
          v
Runtime settings + serial orchestrator
          |
          v
Reconciliation state machine
     |            |              |
     v            v              v
state.json   journal.jsonl   settings.json
          |
          v
Validated Immich HTTP adapters
```

## Boundaries

- Public Immich HTTP API only.
- No Redis/PostgreSQL writes, Docker socket, container restarts, or job deletion.
- At most one managed queue is deliberately unpaused.
- Ignored and unknown queues are never mutated.
- All mutations are serialized inside one low-memory Node.js process.

## Main flow

```text
IDLE -> PREPARING -> DISCOVERING [-> counter stabilization] -> INVENTORY_READY
                               -> RUNNING_STAGE <-> WAITING_FOR_QUIET
                               -> COMPLETED | GUARDED_IDLE

GUARDED_IDLE -> CAPTURING_UPLOADS -> DISCOVERING

upload during DISCOVERING / INVENTORY_READY / processing
  -> pause managed queues -> CAPTURING_UPLOADS -> full DISCOVERING restart
```

Arming autopilot and the manual **Scan and process** action normally enter `DISCOVERING` immediately. For each enabled queue the controller temporarily resumes it, starts or adopts its `QueueAll` missing generator, observes that generator through the queue-job API, captures the resulting pending count, and pauses a managed queue again. `INVENTORY_READY` keeps those counts visible for a configurable short hold before processing.

Selected high-churn queues enter a bounded stabilization subphase after `QueueAll`: the queue stays open while its pending count is dropping rapidly, then the controller freezes the stabilized remainder. If shortest-first priority is enabled, a dependency-safe topological selection orders stages by this stabilized count.

Because Immich executes `QueueAll` in its target queue, discovery cannot populate a globally paused queue without opening it temporarily. Polling minimizes the window, but existing or newly created jobs may start before the pause is restored. Active work is never cancelled.

## Queue policies

- `managed`: owned by the serial scheduler and paused during capture/guarded idle.
- `always-running`: included in discovery/order but kept unpaused.
- `ignored`: excluded from stages and never changed.

Dependencies are validated before a run. In particular, facial recognition follows face detection.

Storage template and file migration are protected maintenance queues and never enter controlled stages.

## Durable mutation protocol

Pause/resume operations follow:

```text
PREPARED (fsync) -> API call -> response/read verification -> VERIFIED -> COMMITTED
```

After a crash, idempotent actions are reconciled against observed state. A missing-check start is not idempotent: after an unclear network result the controller looks for timestamped `QueueAll` evidence and asks the operator when evidence is insufficient. It never performs a blind automatic retry.

`state.json` and `settings.json` use temporary writes, file fsync, atomic rename, and directory fsync where supported. `journal.jsonl` is append-and-fsync. Corrupt state is preserved and control becomes read-only. Unchanged ticks and unchanged settings do not rewrite snapshots.

## Upload priority and resources

Managed queues are already paused in guarded idle. Statistics polling detects asset growth within the configured interval, which is validated below 30 seconds. An upload during any active pass pauses dispatch immediately, then restarts the full inventory after fixed or optional asset-count-adjusted quiet time.

Active discovery/processing normally polls every 5 seconds, guarded idle every 10 seconds, and standby every 30 seconds. CPU sampling normally exists only during phases where it is displayed or can throttle dispatch; an explicit setting can keep the same sampler active in idle. There is no separate Node.js healthcheck process.
