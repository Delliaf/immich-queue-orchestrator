import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ActionJournal } from '../src/state/journal.js';
import { StateStore } from '../src/state/store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('durable state', () => {
  it('creates and atomically replaces a valid state snapshot', async () => {
    const directory = await temporaryDirectory();
    const store = new StateStore(directory);
    const state = await store.initialize(new Date('2026-08-01T00:00:00Z'));
    state.autopilotArmed = true;
    await store.save(state);
    expect((await store.load()).autopilotArmed).toBe(true);
    expect(JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'))).toMatchObject({ schemaVersion: 1 });
  });

  it('does not overwrite corrupted state on startup', async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, 'state.json'), '{broken', 'utf8');
    const store = new StateStore(directory);
    await expect(store.initialize()).rejects.toThrow(/valid JSON/);
    expect(await readFile(join(directory, 'state.json'), 'utf8')).toBe('{broken');
  });

  it('keeps an action open until it is committed', async () => {
    const directory = await temporaryDirectory();
    const journal = new ActionJournal(directory);
    await journal.initialize();
    const prepared = await journal.prepare({
      runId: '7665866a-8112-4f66-a4ac-e67e3cdd9b9f',
      action: 'pause',
      queue: 'metadataExtraction',
      beforePaused: false,
      desiredPaused: true,
      reason: 'test',
    });
    expect(await journal.openActions()).toHaveLength(1);
    await journal.appendTransition(prepared, 'VERIFIED');
    expect(await journal.openActions()).toHaveLength(1);
    await journal.appendTransition(prepared, 'COMMITTED');
    expect(await journal.openActions()).toHaveLength(0);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'immich-orchestrator-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
