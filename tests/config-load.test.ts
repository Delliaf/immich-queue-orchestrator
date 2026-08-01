import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, loadSecrets } from '../src/config/load.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('environment configuration', () => {
  it('accepts a simple Immich URL and numeric-second polling values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'immich-orchestrator-config-'));
    directories.push(directory);
    const path = join(directory, 'config.yml');
    await writeFile(path, 'version: 1\n', 'utf8');

    const config = await loadConfig(path, {
      IMMICH_URL: 'http://immich-server:2283',
      POLL_INTERVAL: '5',
      GUARDED_IDLE_POLL_INTERVAL: '10',
      UPLOAD_QUIET_PERIOD: '30m',
      ALLOW_LEGACY_START: 'false',
    });

    expect(config.api.url).toBe('http://immich-server:2283/api');
    expect(config.scheduler.pollIntervalMs).toBe(5_000);
    expect(config.scheduler.guardedIdlePollIntervalMs).toBe(10_000);
    expect(config.autopilot.autoEndAfterMs).toBe(30 * 60_000);
  });

  it('supports API_KEY as a compose-friendly alias', async () => {
    const secrets = await loadSecrets({ API_KEY: 'immich-key', ORCHESTRATOR_ADMIN_PASSWORD: 'panel-password' });
    expect(secrets.immichApiKey).toBe('immich-key');
    expect(secrets.adminPassword).toBe('panel-password');
  });

  it('loads the simple Docker preset with automatic panel authentication', async () => {
    const config = await loadConfig('orchestrator.docker.yml', { IMMICH_URL: 'http://immich-server:2283' });
    expect(config.server.authentication).toBe('auto');
  });
});
