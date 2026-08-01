# Immich Queue Orchestrator

[Русская версия](README.ru.md)

A lightweight controller for Immich background queues on home servers with limited CPU and memory.

> Status: early release `0.3.0`. API contracts were validated against Immich `v3.1.0`. Keep a current backup and test against your Immich version before relying on unattended operation.

## What it does

- pauses managed processing queues as soon as a new upload is detected;
- immediately asks Immich to check for missing work when autopilot is armed or **Scan and process** is pressed;
- briefly shows the discovered per-queue inventory, then processes one queue at a time;
- optionally prioritizes the smallest stabilized backlog while preserving pipeline dependencies;
- filters short-lived bulk counter spikes for metadata, sidecar, duplicate detection, and facial recognition;
- interrupts discovery or processing when another upload starts, waits for quiet, and scans again;
- supports `managed`, `always running`, and `ignored` policies for every queue;
- optionally adapts the upload quiet period to the number of new assets and runs periodic missing checks;
- shows live queues, discovered counts, CPU load, and all runtime settings in an embedded panel;
- keeps a bounded, redacted in-memory log with normal, detailed, and maximum diagnostic levels and one-click report download;
- writes durable state and settings only when their content changes;
- never writes directly to Redis or PostgreSQL and does not require the Docker socket.

## Autopilot flow

```text
ARM AUTOPILOT
  -> scan every enabled queue for missing work
  -> pause each managed queue after its scan and show found counts
  -> process managed queues sequentially
  -> GUARDED IDLE (managed queues paused)

new upload at any point
  -> pause managed queues immediately
  -> wait for the configured quiet period
  -> scan all enabled queues again
  -> process sequentially
```

Immich runs its bulk missing check inside the same queue that receives the discovered jobs. During inventory the orchestrator therefore opens one queue temporarily, observes its `QueueAll` job, and pauses it as soon as discovery finishes. Already-active jobs cannot be cancelled and may finish normally.

## Simple Docker Compose setup

Add this service under the existing `services:` section of Immich:

```yaml
  immich-queue-orchestrator:
    container_name: immich_queue_orchestrator
    image: ghcr.io/delliaf/immich-queue-orchestrator:latest
    env_file:
      - .env
    ports:
      - "8005:8005"
    volumes:
      - immich_queue_orchestrator_data:/data
    depends_on:
      - immich-server
    restart: unless-stopped
```

Add the named volume at the top level:

```yaml
volumes:
  immich_queue_orchestrator_data:
```

Add these values to the existing Immich `.env` file:

```dotenv
ORCHESTRATOR_API_KEY=a_dedicated_Immich_API_key_for_this_orchestrator
# Optional. Leave empty on a trusted home network if a panel password is unnecessary.
ORCHESTRATOR_ADMIN_PASSWORD=
```

Create the API key in an Immich administrator account and grant only:

- `queue.read`
- `queue.update`
- `server.statistics`
- `job.create`
- `queueJob.read`

The application-specific `ORCHESTRATOR_API_KEY` name lets other tools in the same `.env` use separate keys. The optional panel password is a normal password, not an API token; any non-empty value enables login and no password-composition rules are imposed. Keep `.env` out of Git and do not expose a passwordless panel to the internet.

Start it and open the panel:

```bash
docker compose up -d immich-queue-orchestrator
```

Open `http://<server-ip>:8005` and click **Arm autopilot**. From another device, `127.0.0.1` refers to that device, not the server. For ZeroTier use `http://<server-zerotier-ip>:8005`. To bind only to ZeroTier, publish `<server-zerotier-ip>:8005:8005` instead.

A copy-ready fragment is available in [`compose.simple.yml`](compose.simple.yml).

Installing or restarting a fresh container never resumes queues by itself. It waits for an explicit panel action. An unfinished run already owned and persisted by the orchestrator can resume after restart.

## Panel and settings

The panel has separate **Overview**, **Queues**, **Automation**, **CPU load**, **Logs**, and **Advanced** tabs. Runtime settings are saved atomically to `/data/settings.json`; secrets and bootstrap networking remain in `.env` or the mounted YAML file. An unchanged save or polling tick does not rewrite the disk.

Logging defaults to **Normal**. **Detailed** adds controller decisions and state transitions; **Maximum diagnostics** also records every polling cycle, queue snapshot, request path, status, duration, and rejected Immich response body. API keys, passwords, tokens, and authorization headers are redacted. The panel retains a configurable ring of 100–20,000 entries in RAM and can download a diagnostic JSON report containing the current status, non-secret configuration, settings, and retained log. The on-screen view fetches only the latest 1,000 entries to stay responsive.

The default queue order is:

1. Thumbnail generation
2. Metadata extraction
3. Sidecar metadata
4. Smart search
5. Duplicate detection
6. Face detection
7. Facial recognition
8. OCR
9. Video conversion

Every queue is `managed` and has **Check missing** enabled by default. Facial recognition remains after face detection. Processing uses the configured order by default; **smallest stabilized backlog first** can finish short queues earlier without violating dependencies.

Metadata extraction, sidecar, duplicate detection, and facial recognition have transient-counter stabilization enabled by default. A rapidly falling initial count is observed in 15-second windows for up to two minutes, and both the initial and stabilized values are shown. The queue policy, missing check, stabilization, quiet periods, polling, discovery timeout, optional adaptive delay, optional periodic discovery, priority strategy, and CPU guard can all be changed in the panel. Periodic discovery, adaptive quiet, and idle CPU display are disabled by default.

Storage Template Migration and the system Migration queue are never part of automatic control. Immich runs storage migration as a separate long serial operation; use the Immich administration panel deliberately if it is ever required.

## Fast development image

Direct pushes to the `dev` branch publish `ghcr.io/delliaf/immich-queue-orchestrator:dev`. This workflow builds only `linux/amd64`, skips the test and Docker verification jobs, does not start QEMU, and reuses the GitHub build cache. It is intended for quick diagnostics before changes are promoted to a tested multi-architecture release.

When autopilot is turned off, the panel asks what to do every time. The default choice keeps managed queues paused; the alternative restores the queue states captured when control began.

## Manual operation

**Scan and process** performs the same inventory-first pass without permanently arming autopilot. If an upload starts during that manual pass, managed queues are paused immediately; after upload silence the complete scan and sequential pass restart.

The missing check uses Immich's `force=false` bulk job. A network failure around that non-idempotent request is never retried silently: the panel asks the operator whether to accept, retry, or abort it.

## Documentation

- [Configuration](docs/configuration.md)
- [Architecture and state machine](docs/architecture.md)
- [Recovery and incident handling](docs/recovery.md)
- [Immich compatibility](docs/compatibility.md)
- [Current project plan](docs/project-plan.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## License

Apache License 2.0. Immich is a separate project; this repository is not an official part of Immich.
