import { describe, expect, it } from 'vitest';
import { parseDuration } from '../src/config/duration.js';
import { parseConfig } from '../src/config/schema.js';

describe('configuration', () => {
  it('loads safe defaults', () => {
    const config = parseConfig({});
    expect(config.mode).toBe('observe');
    expect(config.dryRun).toBe(true);
    expect(config.control.enabled).toBe(false);
    expect(config.api.allowLegacyStart).toBe(true);
    expect(config.server.authentication).toBe('auto');
    expect(config.server.port).toBe(8005);
    expect(config.autopilot.autoEndAfterMs).toBe(30 * 60_000);
    expect(config.scheduler.guardedIdlePollIntervalMs).toBe(10_000);
    expect(config.scheduler.standbyPollIntervalMs).toBe(30_000);
    expect(config.scheduler.managedQueues).not.toContain('backgroundTask');
  });

  it('parses human durations', () => {
    expect(parseDuration('250ms')).toBe(250);
    expect(parseDuration('2.5s')).toBe(2_500);
    expect(parseDuration('30m')).toBe(1_800_000);
  });

  it('rejects forbidden managed queues', () => {
    expect(() =>
      parseConfig({
        scheduler: { managedQueues: ['backgroundTask'] },
        pipeline: [],
      }),
    ).toThrow(/forbidden/i);
    expect(() =>
      parseConfig({
        scheduler: { managedQueues: ['storageTemplateMigration'] },
        pipeline: [
          {
            id: 'storage',
            queue: 'storageTemplateMigration',
            dependsOn: [],
            resourceGroup: 'io',
          },
        ],
      }),
    ).toThrow(/forbidden/i);
  });

  it('requires hysteresis for CPU throttling', () => {
    expect(() =>
      parseConfig({
        loadGuard: { mode: 'throttle', pauseAbove: 80, resumeBelow: 80 },
      }),
    ).toThrow(/lower/i);
  });

  it('keeps guarded-idle upload detection below 30 seconds', () => {
    expect(() => parseConfig({ scheduler: { guardedIdlePollInterval: '30s' } })).toThrow(/below 30 seconds/i);
  });

  it('rejects a pipeline cycle', () => {
    expect(() =>
      parseConfig({
        scheduler: { managedQueues: ['metadataExtraction', 'thumbnailGeneration'] },
        pipeline: [
          {
            id: 'a',
            queue: 'metadataExtraction',
            dependsOn: ['b'],
            resourceGroup: 'cpu-io',
          },
          {
            id: 'b',
            queue: 'thumbnailGeneration',
            dependsOn: ['a'],
            resourceGroup: 'cpu-io',
          },
        ],
      }),
    ).toThrow(/cycle/i);
  });

  it('rejects a serial order that places a stage before its dependency', () => {
    expect(() =>
      parseConfig({
        scheduler: { managedQueues: ['thumbnailGeneration', 'metadataExtraction'] },
        pipeline: [
          {
            id: 'thumbnails',
            queue: 'thumbnailGeneration',
            dependsOn: ['metadata'],
            resourceGroup: 'cpu-io',
          },
          {
            id: 'metadata',
            queue: 'metadataExtraction',
            dependsOn: [],
            resourceGroup: 'cpu-io',
          },
        ],
      }),
    ).toThrow(/before its dependency/i);
  });
});
