# Immich Queue Orchestrator

[Русская версия](README.ru.md)

An independent controller for Immich background queues on home servers with limited CPU and memory.

> Status: early release `0.1.5`. API contracts were validated against Immich `v3.1.0`. Start with `dryRun: true` on a real library and keep a backup.

## What it does

- keeps heavy processing queues paused while files are being uploaded;
- detects new assets and waits for a configurable quiet period, 30 minutes by default;
- processes exactly one managed queue at a time;
- drains already queued jobs first and can then run one optional missing-repair pass;
- shows queues, the current phase, and CPU load in an embedded web panel;
- recovers after restarts through atomic state and an append-only action journal;
- stops for an operator decision when a legacy start has an ambiguous result;
- never writes directly to Redis or PostgreSQL and does not require the Docker socket.

## Autopilot flow

```text
GUARDED_IDLE (managed queues paused)
  -> new photos or videos arrive
  -> CAPTURING_UPLOADS
  -> 30 minutes without new uploads
  -> metadata -> storage -> thumbnails -> ML/OCR/video
  -> GUARDED_IDLE
```

If uploading resumes during processing, the current active job is allowed to finish, dispatch of the next job is paused, and the upload quiet timer starts again.

## Simple setup in an existing Immich Docker Compose file

Add this service under the existing `services:` section:

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

Add this entry to the existing top-level `volumes:` section:

```yaml
volumes:
  immich_queue_orchestrator_data:
```

Add two values to the existing Immich `.env` file:

```dotenv
ORCHESTRATOR_API_KEY=a_dedicated_Immich_API_key_for_this_orchestrator
# Optional. Leave empty if a password is unnecessary on your trusted home network.
ORCHESTRATOR_ADMIN_PASSWORD=
```

The default `server.authentication: auto` mode behaves as follows:

- an omitted or empty variable leaves the panel open without a password;
- any non-empty value makes the panel request that password;
- there are no forced length, digit, or special-character requirements.

The built-in image configuration already contains the Immich service URL, upload timing, sequential processing, and low-memory Node.js settings. `ORCHESTRATOR_API_KEY` deliberately has an application-specific name so another service such as Immich Power Tools can use its own Immich API key in the same `.env`. The API key and the optional panel password are read directly from the same `.env` that Immich already uses. The real `.env` is excluded from Git and the Docker build context; only an empty `.env.example` is committed. The panel password is a normal password for this panel, not an API token or an Immich key. When authentication is disabled, the panel displays a prominent warning. Do not expose that mode to the internet.

Then run `docker compose up -d immich-queue-orchestrator`, open `http://<server-ip>:8005`, enter the panel password if configured, and click **Arm autopilot** once. In armed idle, managed queues are already paused. Upload activity is normally detected in about 10 seconds and the configured interval must remain below 30 seconds. The armed state is stored in the named volume and survives restarts.

The default `8005:8005` mapping works through both the server's LAN and ZeroTier addresses. From another device, `127.0.0.1` points to that device itself, not to the server; use `http://<server-zerotier-ip>:8005`. To expose the panel only through ZeroTier, change the port mapping to `<server-zerotier-ip>:8005:8005`.

A ready-to-merge service definition is available in [`compose.simple.yml`](compose.simple.yml).

This service does not need `MAX_CONCURRENT_JOBS`: it keeps only one managed queue open. Immich itself controls the number of jobs executing inside that queue.

With `ALLOW_LEGACY_START=false`, only jobs already created by Immich are processed. After validating the orchestrator against your Immich version, set it to `true` to enable the sequential **missing jobs** repair pass.

## Advanced setup with a separate YAML file

1. Create a dedicated API key in an Immich administrator account. Queued-only mode needs `queue.read`, `queue.update`, and `server.statistics`. Missing repair additionally needs `job.create` and `queueJob.read`; the latter supports safe recovery from an ambiguous start.
2. Copy the configuration:

   ```bash
   cp orchestrator.example.yml orchestrator.yml
   mkdir -p secrets orchestrator-data
   printf '%s' 'YOUR_IMMICH_API_KEY' > secrets/immich_api_key.txt
   printf '%s' 'YOUR_PANEL_PASSWORD' > secrets/orchestrator_admin_password.txt
   ```

3. Attach the service to the Docker network where `immich-server` is reachable, then start it:

   ```bash
   docker compose -f compose.example.yml up -d --build
   ```

4. Open the panel locally or through an SSH tunnel at `http://127.0.0.1:8005` and enter the panel password.
5. Keep `dryRun: true` for the first start and verify the Immich version, queues, and effective configuration.
6. Set `dryRun: false`, recreate the container, and click **Arm autopilot** to enable control.

Installing or restarting the container does not resume queues by itself. A new installation waits for an explicit command. Only an unfinished run previously owned and persisted by the orchestrator resumes automatically.

## Modes

- `observe`: status and CPU monitoring only;
- `manual-session`: one **Process backlog** command followed by an automatic pass;
- `capture-assisted`: manual **Start capture** and **Uploads finished** commands;
- `autopilot`: permanent guarded idle, automatic upload detection, and processing passes;
- `scheduled`: reserved by the configuration schema; the scheduling loop is not enabled in `0.1.0`.

## Missing-repair safety

`allowLegacyStart` is disabled by default. Without it, the controller processes only jobs that Immich has already created.

When the repair pass is enabled:

1. the queue must first reach zero `active + waiting + paused + delayed` jobs;
2. one `force=false` start is issued;
3. a network failure around that start is treated as ambiguous;
4. the start is never retried automatically—the operator decides in the panel.

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
