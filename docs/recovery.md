# Recovery

[Русская версия](ru/recovery.md)

## Container restart

- No persisted run: observe only; queues are not changed.
- Unfinished owned run with `resumePersistedRun: true`: reconcile the journal and continue.
- Discovery generator still present: adopt it instead of sending a duplicate start.
- Persisted guarded-idle run with an older queue list: rebuild the safe idle stages and immediately start the new inventory pass.
- Corrupt `state.json`: preserve it, become read-only, and require manual backup/repair.
- Missing or corrupt `settings.json`: startup fails with the validation error rather than silently replacing operator settings.

## Upload interruption

An upload during discovery, inventory display, or processing pauses managed queues immediately. A `QueueAll` generator that was already active may finish. After the upload quiet period the orchestrator resets the old inventory and scans every enabled queue again, including one fresh scan after an adopted interrupted generator.

## Manual override

If a user changes a queue in Immich and observed state differs from the committed desired state, the controller enters `PAUSED_BY_OPERATOR` instead of fighting the user.

- **Resume controller** accepts the current run and continues.
- **Release control** asks every time whether to keep managed queues paused or restore states captured at run start. Keeping them paused is the default selection.

## Ambiguous missing start

`PUT /api/jobs/{queue}` is not idempotent. If the request may have reached Immich but no conclusive response or timestamped `QueueAll` evidence exists, the controller stops in `AMBIGUOUS_START`.

- `assume-sent`: observe the queue as if the request arrived;
- `retry-start`: explicitly authorize a potentially duplicate request;
- `abort`: finish the run and release according to the selected strategy.

Check the Immich Jobs UI before choosing. There is no automatic retry.

## API unavailable

A read failure never means an empty queue. The controller preserves state, stops new mutations, and retries observation. `/healthz` remains available while `/readyz` reports the degraded state.

## Backup

Back up the `/data` volume. It contains `state.json`, `journal.jsonl`, and `settings.json`, but not the API key or panel password. Back up `.env`/mounted secrets separately. Do not edit these files while the container is running.

## State volume permission error

New named volumes are initialized for the non-root runtime user. If a volume created by an older image logs `EACCES`, stop the service and repair that exact verified volume once:

```bash
docker compose stop immich-queue-orchestrator
docker run --rm --user root \
  -v <compose-volume-name>:/data \
  ghcr.io/delliaf/immich-queue-orchestrator:latest \
  chown -R node:node /data
docker compose up -d immich-queue-orchestrator
```

Obtain the exact name with `docker volume ls`; do not substitute an unverified volume.
