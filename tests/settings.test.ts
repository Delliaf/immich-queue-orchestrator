import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config/schema.js';
import { defaultRuntimeSettings, parseRuntimeSettings } from '../src/settings/schema.js';
import { SettingsStore } from '../src/settings/store.js';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('runtime settings', () => {
  it('persists settings only when their content changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'immich-orchestrator-settings-'));
    directories.push(directory);
    const store = new SettingsStore(directory);
    const defaults = defaultRuntimeSettings(parseConfig({}));

    await store.initialize(defaults);
    expect(await store.save(structuredClone(defaults))).toBe(false);

    const changed = structuredClone(defaults);
    changed.automation.uploadQuietPeriodMs = 15 * 60_000;
    expect(await store.save(changed)).toBe(true);
    expect(await store.save(structuredClone(changed))).toBe(false);

    const reloaded = await new SettingsStore(directory).initialize(defaults);
    expect(reloaded.automation.uploadQuietPeriodMs).toBe(15 * 60_000);
  });

  it('rejects duplicate queues and invalid CPU hysteresis', () => {
    const settings = defaultRuntimeSettings(parseConfig({}));
    settings.queues.push(structuredClone(settings.queues[0]!));
    settings.loadGuard.mode = 'throttle';
    settings.loadGuard.pauseAbove = 70;
    settings.loadGuard.resumeBelow = 80;
    expect(() => parseRuntimeSettings(settings)).toThrow();
  });

  it('includes every user-facing missing-media queue as managed by default', () => {
    const settings = defaultRuntimeSettings(parseConfig({}));
    expect(settings.queues.map((queue) => queue.queue)).toEqual([
      'thumbnailGeneration',
      'metadataExtraction',
      'sidecar',
      'smartSearch',
      'duplicateDetection',
      'faceDetection',
      'facialRecognition',
      'ocr',
      'videoConversion',
    ]);
    expect(settings.queues.every((queue) => queue.policy === 'managed' && queue.checkMissing)).toBe(true);
  });
});
