# Immich compatibility

[Русская версия](ru/compatibility.md)

Validated baseline: Immich `v3.1.0`, source snapshot `483b375c26c91e9ad3d42666fff58b3fbda1164a`.

| Endpoint | Purpose | Immich status |
|---|---|---|
| `GET /api/server/version` | Version gate | Public/stable |
| `GET /api/server/features` | Feature-aware pipeline | Public |
| `GET /api/server/statistics` | Upload activity | Admin/stable |
| `GET /api/queues` | Queue state and counters | Alpha |
| `PUT /api/queues/{name}` | Pause/resume | Alpha |
| `GET /api/queues/{name}/jobs` | `QueueAll` evidence and recovery | Alpha, limited result set |
| `PUT /api/jobs/{name}` | `force=false` missing check | Deprecated since v2.4.0, still used by Immich admin UI |

Runtime responses are validated with Zod. Unknown queues never enter the managed allowlist. In strict mode an unvalidated Immich major version blocks mutations.

The nine default bulk names are thumbnail generation, metadata extraction, sidecar, smart search, duplicate detection, face detection, facial recognition, OCR, and video conversion. Their QueueAll mappings were checked against the server queue implementation, including sidecar and facial recognition.

## Discovery behavior

The missing endpoint enqueues a `QueueAll` generator into its own target queue. A paused queue therefore cannot generate its inventory until temporarily resumed. The orchestrator handles one queue at a time, observes the expected generator, pauses a managed queue after it disappears, and records the remaining pending count. A generator already present after a restart is adopted rather than duplicated; after an upload interruption it is followed by one new scan.

The endpoint itself is non-idempotent and has no replacement bulk-start endpoint in the validated version. Ambiguous delivery requires operator confirmation rather than an automatic retry.

## Counter limitations

- `completed` and `failed` depend on Immich retention policy.
- Job inspection is limited to approximately the first thousand entries.
- `isPaused` is global queue state; `statistics.paused` is the paused job count.
- Active jobs cannot be cancelled by pausing.
- Immich does not allow pausing `backgroundTask`.
