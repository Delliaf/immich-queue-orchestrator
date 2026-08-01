# Recovery

[Русская версия](ru/recovery.md)

## Container restart

- Without a persisted run: observe only; queues are not changed.
- With an unfinished owned run and `resumePersistedRun: true`: reconcile the journal and continue.
- With corrupt state: remain read-only; repair only after manually backing up `/data`.

## Manual override

If a user changes pause/resume in the Immich UI and observed state differs from the committed desired state, the controller enters `PAUSED_BY_OPERATOR`. It does not fight the user every five seconds.

Actions:

- **Resume controller**: accept the current run and continue;
- **Release control**: restore the queue states captured at the beginning of the run and remove active ownership.

## AMBIGUOUS_START

This state occurs when `PUT /api/jobs/{queue}` may have reached Immich but no response was received, or the process stopped before a durable commit.

The panel offers:

- `assume-sent`: treat the start as delivered and observe the queue;
- `retry-start`: explicitly authorize a potentially duplicate start;
- `abort`: restore the original queue states and finish the run.

Check the Immich Jobs UI before deciding. There is no automatic retry.

## API unavailable

A polling failure never means that a queue is empty. The controller preserves state and retries a read-only poll. It performs no new mutations until observation recovers. The health endpoint remains available while readiness becomes false.

## Backup

Back up the `/data` volume together with the configuration. Back up the API key and, if used, the panel password separately as secrets. Do not edit `journal.jsonl` while the container is running.
