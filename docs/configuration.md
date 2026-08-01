# Configuration

[Русская версия](ru/configuration.md)

The published image contains `/app/orchestrator.docker.yml` with sensible home-server bootstrap defaults. Most day-to-day settings are edited in the web panel and stored in `/data/settings.json`. Secrets, the Immich URL, bind address, port, version gate, and first-start safety remain environment/YAML settings.

## Bootstrap environment

| Variable | Purpose |
|---|---|
| `CONFIG_FILE` | YAML path; `/app/orchestrator.docker.yml` in the image |
| `DATA_DIR` | Durable state, journal, and runtime settings; `/data` in the image |
| `IMMICH_URL` | Overrides the Immich API URL |
| `ORCHESTRATOR_API_KEY` | Dedicated Immich API key for this application |
| `ORCHESTRATOR_API_KEY_FILE` | Optional file containing that key |
| `ORCHESTRATOR_ADMIN_PASSWORD` | Optional normal login password for the panel |
| `ORCHESTRATOR_ADMIN_PASSWORD_FILE` | Optional file containing the panel password |
| `ORCHESTRATOR_HOST` / `ORCHESTRATOR_PORT` | Bind address and port overrides |
| `LOG_LEVEL` | `debug`, `info`, `warn`, or `error` |
| `POLL_INTERVAL` | Initial active polling interval |
| `GUARDED_IDLE_POLL_INTERVAL` | Initial upload detector interval; below 30 seconds |
| `STANDBY_POLL_INTERVAL` | Initial polling while autopilot is not armed |
| `UPLOAD_QUIET_PERIOD` | Initial quiet period, for example `30m` |
| `ALLOW_LEGACY_START` | Compatibility switch for Immich's bulk missing endpoint; built-in default `true` |

The simple Compose setup reads `ORCHESTRATOR_API_KEY` and the optional password from the existing Immich `.env`. Keep the real `.env` out of Git. `_FILE` variants are available for installations that prefer file-mounted secrets.

`server.authentication: auto` enables login only when the password is non-empty. `password` requires it; `none` disables login explicitly. There are no forced length or character rules. After five failed attempts, one IP is blocked for five minutes. A passwordless panel should remain on a trusted network.

The default mapping `8005:8005` exposes the panel on the server's LAN and ZeroTier addresses. Use `<server-zerotier-ip>:8005:8005` to bind only to ZeroTier, or `127.0.0.1:8005:8005` for local/reverse-proxy-only access.

## Immich API key permissions

Create a dedicated key in an Immich administrator account. Do not grant all permissions. The required set is:

- `queue.read`: queue counters and pause state;
- `queue.update`: pause and resume;
- `server.statistics`: detect new photos and videos;
- `job.create`: start each `force=false` missing check;
- `queueJob.read`: observe the `QueueAll` generator and reconcile an ambiguous request.

`queueJob.delete`, `job.read`, asset permissions, and project-wide API access are not required.

## Runtime settings

The panel is the primary editor. It validates and atomically writes `/data/settings.json`; saving unchanged values performs no disk write. Bootstrap YAML provides defaults only when this file does not yet exist.

### Queues

Each listed queue has an order, a **Check missing** switch, a **Stabilize count** switch, and one policy:

- `managed`: pause during uploads/idle and process sequentially;
- `always-running`: the orchestrator keeps it unpaused and never pauses it at stage completion;
- `ignored`: never mutated or included in a run.

The default exact order is `thumbnailGeneration`, `metadataExtraction`, `sidecar`, `smartSearch`, `duplicateDetection`, `faceDetection`, `facialRecognition`, `ocr`, and `videoConversion`. All are managed and checked for missing work. Count stabilization defaults on for metadata extraction, sidecar, duplicate detection, and facial recognition. Keep facial recognition after face detection.

Do not manage system queues such as `backgroundTask`, `migration`, `search`, `notifications`, `backupDatabase`, `workflow`, `integrityCheck`, or `editor`. `storageTemplateMigration` is also prohibited: it is a separate long serial file-moving operation rather than ordinary missing-media processing.

### Automation

| Setting | Default behavior |
|---|---|
| Scan on autopilot start | On |
| Scan on manual start | On |
| Processing priority | Configured order; optional smallest stabilized backlog first |
| Upload quiet period | 30 minutes |
| Adaptive quiet | Off; if enabled, adds time per newly uploaded asset up to a maximum |
| Periodic missing scan | Off; can run every 1–720 hours while armed and idle |
| Discovery settle | 10 seconds for a fast `QueueAll` fallback |
| Discovery timeout | 10 minutes per queue |
| Inventory display hold | 5 seconds |
| Transient counter stabilization | On for selected queues; 15-second windows, at least 20% decay, 2-minute maximum |
| Active poll | 5 seconds |
| Guarded-idle poll | 10 seconds and always below 30 seconds |
| Standby poll | 30 seconds |
| Empty-queue confirmation | 30 seconds |

An upload detected during discovery or processing pauses managed queues immediately. After the quiet period, the previous inventory is discarded and every enabled queue is checked again. Periodic discovery follows the same scan-and-process path even when no upload occurred.

With **smallest stabilized backlog first**, stages are topologically reordered after discovery. The smallest ready queue runs first, but a dependency always remains earlier; facial recognition therefore cannot precede face detection.

During transient stabilization the selected queue remains open while its generated count is falling quickly. Every observation window compares the new pending count with the previous sample. Observation continues only while the configured percentage drop is met, and stops on a stable count, zero, or the maximum duration. The initial spike and stabilized remainder are both retained for the panel.

### CPU load guard

`off` performs no CPU sampling. `observe` samples only during discovery/processing so the panel can show relevant load. `throttle` additionally pauses managed dispatch after sustained high load and resumes after sustained low load. The moving-average window must be at least the sampling interval and the resume threshold must be below the pause threshold.

CPU sampling is stopped in standby, guarded idle, and upload capture by default. **Show CPU load while idle** can opt into sampling in unarmed and guarded idle; this uses the existing in-process sampler and its configured interval, but naturally adds background wakeups. Upload capture still disables it. The image has no separate periodic Node.js healthcheck process.

## Bootstrap safety switches

```yaml
dryRun: false
control:
  enabled: true
  newInstallAction: wait
api:
  allowLegacyStart: true
  strictMajorVersion: true
```

- `dryRun: true` blocks Immich queue mutations and run actions; local runtime settings can still be prepared in the panel.
- `control.enabled: false` disables control completely.
- `newInstallAction: wait` prevents a fresh install from touching queues until an explicit action.
- `allowLegacyStart: false` disables missing discovery and is intended only as a compatibility fallback.
- `strictMajorVersion: true` blocks mutations against an unknown Immich major version.

## Completion

A queue is empty only when `active + waiting + paused + delayed` is zero for the configured confirmation period. An API error is always unknown state, never an empty snapshot.
