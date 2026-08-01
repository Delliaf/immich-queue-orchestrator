# Immich compatibility

[Русская версия](ru/compatibility.md)

Validated baseline: Immich `v3.1.0`, source snapshot `483b375c26c91e9ad3d42666fff58b3fbda1164a`.

Used endpoints:

| Endpoint | Purpose | Immich status |
|---|---|---|
| `GET /api/server/version` | Version gate | Public/stable |
| `GET /api/server/features` | Feature-aware pipeline | Public |
| `GET /api/server/statistics` | Upload activity | Admin/stable |
| `GET /api/queues` | Queue states and counters | Alpha |
| `PUT /api/queues/{name}` | Pause/resume | Alpha |
| `GET /api/queues/{name}/jobs` | Recovery evidence | Alpha, limited result set |
| `PUT /api/jobs/{name}` | Optional missing repair | Deprecated since v2.4.0 |

Runtime responses are validated with Zod schemas. An unknown queue is never added to the managed allowlist. In strict mode, an unknown major version blocks control mutations.

## Counter limitations

- `completed` and `failed` depend on retention policy.
- Job inspection is limited to approximately the first thousand entries.
- `isPaused` is the queue's global state; `statistics.paused` is the number of jobs in the paused list.
- Immich does not allow pausing `backgroundTask`.

## Why missing repair runs after drain

The legacy endpoint checks only active jobs. Most QueueAll jobs have no deduplication key. Starting it over a waiting or paused backlog can add duplicate bulk work. The controller therefore waits for every pending state to reach zero before allowing one repair pass.
