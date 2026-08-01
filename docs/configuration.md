# Configuration

[Русская версия](ru/configuration.md)

The published image contains `/app/orchestrator.docker.yml` for simple deployments. A custom `/config/orchestrator.yml` can be mounted read-only and selected with `CONFIG_FILE`. The simple Compose setup reads the Immich API key and the optional panel password from `.env`; the real `.env` must never be committed. The advanced Compose example keeps file-based secrets as an optional stricter setup.

## Bootstrap environment

| Variable | Purpose |
|---|---|
| `CONFIG_FILE` | YAML path; defaults to `./orchestrator.yml` locally and `/app/orchestrator.docker.yml` in the image |
| `DATA_DIR` | Durable state and journal; defaults to `./data` or `/data` in the image |
| `IMMICH_URL` | Overrides `api.url` |
| `IMMICH_API_KEY` | Immich API key; used by the simple `.env` setup |
| `IMMICH_API_KEY_FILE` | Optional file containing the Immich API key for a stricter setup |
| `API_KEY` | Compose-friendly alias for `IMMICH_API_KEY` |
| `ORCHESTRATOR_ADMIN_PASSWORD_FILE` | File containing the panel password |
| `ORCHESTRATOR_ADMIN_PASSWORD` | Panel password supplied directly through the environment |
| `ORCHESTRATOR_HOST` / `ORCHESTRATOR_PORT` | Override the bind address |
| `IMMICH_QUEUE_ORCHESTRATOR_BIND_IP` | Compose host-side bind address; use the server's ZeroTier IP for ZeroTier-only access |
| `LOG_LEVEL` | `debug`, `info`, `warn`, or `error` |
| `POLL_INTERVAL` | Active polling; a number without a unit means seconds |
| `GUARDED_IDLE_POLL_INTERVAL` | New-upload detector; must be below 30 seconds |
| `STANDBY_POLL_INTERVAL` | Polling while autopilot is not armed |
| `UPLOAD_QUIET_PERIOD` | Autopilot quiet period, for example `30m` |
| `ALLOW_LEGACY_START` | `true/false`; enables the missing-repair pass |

The panel password is not an API token and is optional by default. The application imposes no length or character-composition requirements. It never logs the password or stores it under `/data`. Use `ORCHESTRATOR_ADMIN_PASSWORD` for a simple home deployment and `ORCHESTRATOR_ADMIN_PASSWORD_FILE` for a stricter setup.

`server.authentication` controls behavior:

- `auto`: authentication is enabled only when a non-empty password is supplied;
- `password`: a password is required and startup fails when it is missing;
- `none`: password authentication is disabled even if a variable is present.

After five failed attempts, one IP address is blocked for five minutes. The browser keeps the password only in the current tab's `sessionStorage`. Without a password, the panel shows a trusted-network warning.

## Immich API key permissions

The key must belong to an Immich administrator account because queue and server-statistics endpoints require administrator context. Do not grant every permission.

Minimum permissions for safely processing jobs that already exist:

- `queue.read`;
- `queue.update`;
- `server.statistics`.

If `ALLOW_LEGACY_START=true` or `api.allowLegacyStart: true`, also grant:

- `job.create`: starts the missing-jobs check;
- `queueJob.read`: searches for proof of a completed start after a network failure or restart.

`queueJob.delete`, `job.read`, asset permissions, and project-wide API access are not required.

## Safety switches

```yaml
dryRun: true
control:
  enabled: true
api:
  allowLegacyStart: false
```

- `dryRun: true` blocks every mutation, including actions requested from the panel.
- `control.enabled: false` disables control completely.
- `allowLegacyStart: false` allows queued-only processing.
- `strictMajorVersion: true` blocks mutations against an unknown Immich major version.

## Autopilot

```yaml
autopilot:
  available: true
  autoEndAfter: 30m
  minimumCaptureTime: 1m
  newUploadDuringProcessing: pause-after-active-and-recapture
```

In armed autopilot, all managed queues remain globally paused while idle. The detector combines `photos + videos`, storage usage, and pending counters. This is a polling heuristic: a phone that pauses longer than `autoEndAfter` can split one import into two safe processing passes.

Polling is adaptive: the defaults are 5 seconds during active processing, 10 seconds in `GUARDED_IDLE`, and 30 seconds without an active run. Uploads are therefore detected within 30 seconds without five-second wakeups during a week of inactivity.

## Completion

A stage completes only when all these values are zero at the same time:

```text
active + waiting + paused + delayed
```

Zero must remain stable for the entire `scheduler.quietPeriod`. An API error is never converted into an empty snapshot.

## CPU

```yaml
loadGuard:
  mode: observe
  sampleInterval: 2s
  movingAverageWindow: 30s
```

`local-host` reads the system CPU counters visible to the container. Under Docker Desktop, those counters describe the Linux VM.

CPU sampling is disabled in standby, `GUARDED_IDLE`, and `CAPTURING_UPLOADS`. It runs only in processing phases where its result can pause job dispatch. The accumulated sample window is cleared when sampling stops.

To enable automatic throttling:

```yaml
loadGuard:
  mode: throttle
  pauseAbove: 90
  pauseFor: 30s
  resumeBelow: 65
  resumeFor: 60s
```

`resumeBelow` must be lower than `pauseAbove`. Pausing does not cancel an active job; it only prevents dispatch of subsequent jobs.

## Pipeline

The pipeline is a validated DAG, but the `0.1.0` scheduler executes it strictly in sequence. A `feature` connects a stage to `/api/server/features`; a disabled feature removes the corresponding stage from the run.

Do not add system queues to the managed list: `backgroundTask`, `migration`, `search`, `notifications`, `backupDatabase`, `workflow`, `integrityCheck`, or `editor`.

`library` and `sidecar` are deliberately absent from the default preset. They require separate explicit maintenance operations that are not implemented yet.
