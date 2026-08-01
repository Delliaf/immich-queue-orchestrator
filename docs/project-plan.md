# Project plan

[Русская версия](ru/project-plan.md)

## Status

Version `0.2.0` implements the inventory-first workflow and panel-managed automation settings. The API contract baseline is Immich `v3.1.0`; queue endpoints must be revalidated for later major versions before strict control is enabled.

## Product goal

Automate the low-power home-server workflow:

1. keep heavy queues paused before uploads;
2. detect uploads within 30 seconds and pause immediately;
3. after quiet, run every enabled missing check;
4. pause each managed queue after discovery and expose its inventory count;
5. process queues one at a time in operator-defined order;
6. rescan from the beginning if another upload arrives;
7. return to guarded idle, with optional periodic discovery.

## Safety and resource rules

- Public Immich HTTP API only; no Redis/PostgreSQL or Docker socket.
- Never delete jobs or cancel active work.
- Deliberately open at most one managed queue.
- Treat API errors as unknown state, never empty state.
- Journal intent before mutation and verify afterward.
- Never blindly retry an ambiguous missing start.
- Respect manual changes in Immich.
- One Node.js 24 LTS process with a 64 MiB heap target.
- CPU sampling only during discovery/processing.
- Guarded idle polling below 30 seconds; slower standby polling.
- Change-only persistence and no child-process healthcheck.

## Delivered in 0.2.0

- Immediate discovery on autopilot and manual runs.
- All nine requested queues, including sidecar and ordered face stages.
- Per-queue order, missing switch, and managed/always-running/ignored policies.
- Upload interruption during discovery and processing with a complete rescan.
- Optional adaptive quiet time and periodic discovery.
- Persistent validated settings with no-change write suppression.
- Tabbed English-first panel with live discovered counts and release choice.
- QueueAll adoption/reconciliation across restarts.
- Automated regression tests for discovery, upload interruption, periodic scans, settings, release behavior, and UI API.

## Next validation milestones

- Exercise a large real Immich library and record QueueAll timing for every stage.
- Test upload interruption, restart, API outage, manual override, and always-running policies on real hardware.
- Measure idle memory, wakeups, and CPU on representative mini PCs.
- Revalidate endpoint contracts for each supported Immich major release.
- Refine defaults only from measured real-library behavior.

## Acceptance criteria

- Arming against an existing library discovers missing work without a preceding upload.
- Upload activity is detected within the configured interval, always below 30 seconds in guarded idle.
- Every enabled queue is scanned and its inventory displayed before sequential processing.
- A new upload pauses managed queues and causes a complete post-quiet rescan.
- Facial recognition never precedes face detection.
- A week of idle operation performs no active-rate polling or CPU sampling.
- Unchanged ticks/settings do not rewrite durable snapshots.
- A fresh installation never resumes queues without explicit operator action.
