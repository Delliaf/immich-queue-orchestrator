import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseConfig, type AppConfig } from '../src/config/schema.js';
import { QueueOrchestrator, type AppLogger } from '../src/controller/orchestrator.js';
import type { QueueName, QueueSnapshot } from '../src/domain/queues.js';
import { ImmichApiError, type ImmichApi } from '../src/immich/client.js';
import type { QueueJob, ServerFeatures, ServerStatistics, ServerVersion } from '../src/immich/schemas.js';
import { CpuMonitor } from '../src/monitoring/cpu.js';
import { defaultRuntimeSettings } from '../src/settings/schema.js';
import type { RuntimeSettings } from '../src/settings/schema.js';
import { ActionJournal } from '../src/state/journal.js';
import type { PersistentState } from '../src/state/model.js';
import { StateStore } from '../src/state/store.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('QueueOrchestrator', () => {
  it('does not change pre-existing pauses on first startup', async () => {
    const api = new FakeImmichApi(makeQueue(true, 12));
    const fixture = await createFixture(api, makeConfig(false));
    expect(fixture.orchestrator.status().state?.run).toBeNull();
    expect(api.mutations).toEqual([]);
    await fixture.orchestrator.pollNow();
    expect(api.mutations).toEqual([]);
    await fixture.orchestrator.stop();
  });

  it('allows local panel settings to be prepared while queue mutations are in dry-run', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    const config = makeConfig(false);
    config.dryRun = true;
    const fixture = await createFixture(api, config);
    const settings = fixture.orchestrator.runtimeSettings();
    settings.automation.uploadQuietPeriodMs = 123_000;

    await expect(fixture.orchestrator.updateSettings(settings)).resolves.toBe(true);
    expect(fixture.orchestrator.runtimeSettings().automation.uploadQuietPeriodMs).toBe(123_000);
    expect(api.mutations).toEqual([]);
    await fixture.orchestrator.stop();
  });

  it('drains one queue and restores its original state', async () => {
    const api = new FakeImmichApi(makeQueue(false, 2));
    const fixture = await createFixture(api, makeConfig(false));
    await fixture.orchestrator.processBacklog();
    await pollUntilPhase(fixture, 'COMPLETED');

    const status = fixture.orchestrator.status();
    expect(status.state?.run?.phase).toBe('COMPLETED');
    expect(api.queue.isPaused).toBe(false);
    expect(api.mutations).toEqual(['pause:metadataExtraction', 'resume:metadataExtraction', 'pause:metadataExtraction', 'resume:metadataExtraction']);
    await fixture.orchestrator.stop();
  });

  it('keeps guarded idle, waits for upload silence, processes, then guards again', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    const fixture = await createFixture(api, makeConfig(false));
    await fixture.orchestrator.armAutopilot();
    await pollUntilPhase(fixture, 'GUARDED_IDLE');
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('GUARDED_IDLE');

    api.addUpload(3);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('CAPTURING_UPLOADS');
    fixture.clock.advance(11);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('DISCOVERING');
    await pollUntilPhase(fixture, 'GUARDED_IDLE');
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('GUARDED_IDLE');
    expect(api.queue.isPaused).toBe(true);
    expect(fixture.orchestrator.status().state?.autopilotArmed).toBe(true);
    await fixture.orchestrator.stop();
  });

  it('discovers missing media before processing an apparently empty queue', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    api.missingOnDiscovery = 5;
    const fixture = await createFixture(api, makeConfig(true));

    await fixture.orchestrator.processBacklog();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('DISCOVERING');
    await fixture.orchestrator.pollNow();
    expect(api.startCalls).toBe(1);
    expect(api.queue.isPaused).toBe(false);

    api.finishDiscovery();
    fixture.clock.advance(2);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.stages[0]?.inventoryCount).toBe(5);
    expect(api.queue.isPaused).toBe(true);

    await pollUntilPhase(fixture, 'COMPLETED');
    expect(api.queue.statistics.completed).toBe(5);
    await fixture.orchestrator.stop();
  });

  it('stabilizes a fast-decaying generated counter before recording inventory', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    api.missingOnDiscovery = 40_000;
    const fixture = await createFixture(api, makeConfig(true), (settings) => {
      settings.automation.transientCounterStabilizationEnabled = true;
      settings.automation.transientCounterWindowMs = 15_000;
      settings.automation.transientCounterMaxMs = 120_000;
      settings.automation.transientCounterMinimumDropPercent = 20;
      settings.queues[0]!.stabilizeTransientCount = true;
    });

    await fixture.orchestrator.processBacklog();
    await fixture.orchestrator.pollNow();
    api.finishDiscovery();
    fixture.clock.advance(2);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.stages[0]?.discoveryStatus).toBe('stabilizing');
    expect(fixture.orchestrator.status().state?.run?.stages[0]?.inventoryInitialCount).toBe(40_000);

    api.queue.statistics.waiting = 1_000;
    fixture.clock.advance(15_000);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.stages[0]?.discoveryStatus).toBe('stabilizing');

    api.queue.statistics.waiting = 900;
    fixture.clock.advance(15_000);
    await fixture.orchestrator.pollNow();
    const stage = fixture.orchestrator.status().state?.run?.stages[0];
    expect(stage?.discoveryStatus).toBe('complete');
    expect(stage?.inventoryCount).toBe(900);
    expect(stage?.inventoryInitialCount).toBe(40_000);
    expect(stage?.inventoryStabilized).toBe(true);
    expect(api.queue.isPaused).toBe(true);
    await fixture.orchestrator.stop();
  });

  it('prioritizes the smallest stabilized inventory when selected', async () => {
    const api = new FakeImmichApi(makeQueueNamed('metadataExtraction', true, 100), [
      makeQueueNamed('ocr', true, 5),
    ]);
    api.features.ocr = true;
    const fixture = await createFixture(api, makePriorityConfig(), (settings) => {
      settings.automation.processingPriority = 'smallest-first';
    });

    await fixture.orchestrator.processBacklog();
    await pollUntilPhase(fixture, 'INVENTORY_READY');
    expect(fixture.orchestrator.status().state?.run?.stages.map((stage) => stage.queue)).toEqual([
      'ocr',
      'metadataExtraction',
    ]);
    await fixture.orchestrator.stop();
  });

  it('keeps required dependencies ahead of a smaller inventory', async () => {
    const api = new FakeImmichApi(makeQueueNamed('faceDetection', true, 100), [
      makeQueueNamed('facialRecognition', true, 5),
    ]);
    api.features.facialRecognition = true;
    const fixture = await createFixture(api, makeFacePriorityConfig(), (settings) => {
      settings.automation.processingPriority = 'smallest-first';
    });

    await fixture.orchestrator.processBacklog();
    await pollUntilPhase(fixture, 'INVENTORY_READY');
    expect(fixture.orchestrator.status().state?.run?.stages.map((stage) => stage.queue)).toEqual([
      'faceDetection',
      'facialRecognition',
    ]);
    await fixture.orchestrator.stop();
  });

  it('pauses discovery immediately when an upload starts and scans again after silence', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    const fixture = await createFixture(api, makeConfig(true));

    await fixture.orchestrator.armAutopilot();
    await fixture.orchestrator.pollNow();
    expect(api.startCalls).toBe(1);
    expect(api.queue.isPaused).toBe(false);

    api.addUpload(2);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('CAPTURING_UPLOADS');
    expect(api.queue.isPaused).toBe(true);

    fixture.clock.advance(11);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('DISCOVERING');
    await fixture.orchestrator.pollNow();
    api.finishDiscovery();
    await fixture.orchestrator.pollNow();
    await fixture.orchestrator.pollNow();
    expect(api.startCalls).toBe(2);
    await fixture.orchestrator.stop();
  });

  it('also pauses a manual scan-and-process pass when uploading starts', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    const fixture = await createFixture(api, makeConfig(true));
    await fixture.orchestrator.processBacklog();
    await fixture.orchestrator.pollNow();
    await fixture.orchestrator.pollNow();

    api.addUpload(1);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('CAPTURING_UPLOADS');
    expect(api.queue.isPaused).toBe(true);

    fixture.clock.advance(11);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('DISCOVERING');
    await fixture.orchestrator.stop();
  });

  it('starts an optional periodic discovery while guarded idle', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    const fixture = await createFixture(api, makeConfig(true), (settings) => {
      settings.automation.periodicDiscoveryIntervalMs = 60 * 60_000;
    });

    await fixture.orchestrator.armAutopilot();
    await fixture.orchestrator.pollNow();
    api.finishDiscovery();
    fixture.clock.advance(2);
    await fixture.orchestrator.pollNow();
    await pollUntilPhase(fixture, 'GUARDED_IDLE');

    fixture.clock.advance(60 * 60_000 + 1);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('DISCOVERING');
    await fixture.orchestrator.stop();
  });

  it('keeps managed queues paused when releasing autopilot by default', async () => {
    const api = new FakeImmichApi(makeQueue(false, 0));
    const fixture = await createFixture(api, makeConfig(false));
    await fixture.orchestrator.armAutopilot();
    await pollUntilPhase(fixture, 'GUARDED_IDLE');

    await fixture.orchestrator.release('keep-managed-paused');
    expect(fixture.orchestrator.status().state?.run).toBeNull();
    expect(fixture.orchestrator.status().state?.autopilotArmed).toBe(false);
    expect(api.queue.isPaused).toBe(true);
    await fixture.orchestrator.stop();
  });

  it('restores original queue states when explicitly selected during release', async () => {
    const api = new FakeImmichApi(makeQueue(false, 0));
    const fixture = await createFixture(api, makeConfig(false));
    await fixture.orchestrator.armAutopilot();
    await pollUntilPhase(fixture, 'GUARDED_IDLE');

    await fixture.orchestrator.release('restore-original');
    expect(api.queue.isPaused).toBe(false);
    await fixture.orchestrator.stop();
  });

  it('samples CPU only while a processing stage can use the load guard', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    const fixture = await createFixture(api, makeConfig(false, 'observe'));

    expect(fixture.orchestrator.status().cpu.monitoring).toBe(false);
    await fixture.orchestrator.armAutopilot();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('DISCOVERING');
    expect(fixture.orchestrator.status().cpu.monitoring).toBe(true);
    await pollUntilPhase(fixture, 'GUARDED_IDLE');
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('GUARDED_IDLE');
    expect(fixture.orchestrator.status().cpu.monitoring).toBe(false);

    api.addUpload(1);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('CAPTURING_UPLOADS');
    expect(fixture.orchestrator.status().cpu.monitoring).toBe(false);

    fixture.clock.advance(11);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('DISCOVERING');
    expect(fixture.orchestrator.status().cpu.monitoring).toBe(true);

    await fixture.orchestrator.stop();
    expect(fixture.orchestrator.status().cpu.monitoring).toBe(false);
  });

  it('optionally keeps CPU sampling visible while idle', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    const fixture = await createFixture(api, makeConfig(false, 'observe'), (settings) => {
      settings.loadGuard.monitorInIdle = true;
    });

    expect(fixture.orchestrator.status().cpu.monitoring).toBe(false);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().cpu.monitoring).toBe(true);
    await fixture.orchestrator.stop();
  });

  it('does not fsync state again when a processing tick changes nothing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'immich-orchestrator-write-test-'));
    temporaryDirectories.push(directory);
    const api = new FakeImmichApi(makeQueue(true, 1));
    const config = makeConfig(false);
    config.loadGuard.mode = 'throttle';
    config.loadGuard.pauseAbove = 90;
    config.loadGuard.resumeBelow = 50;
    const stateStore = new CountingStateStore(directory);
    const cpuMonitor = new FixedCpuMonitor(20);
    const orchestrator = new QueueOrchestrator({
      config,
      api,
      stateStore,
      journal: new ActionJournal(directory),
      cpuMonitor,
      logger: silentLogger,
      adminPassword: 'test-password',
      settings: testSettings(config),
      now: () => new Date('2026-08-01T00:00:00Z'),
    });
    await orchestrator.initialize();
    await orchestrator.processBacklog();
    for (let attempt = 0; attempt < 8 && orchestrator.status().state?.run?.phase !== 'WAITING_FOR_QUIET'; attempt += 1) {
      await orchestrator.pollNow();
    }
    const writesBeforeStableTick = stateStore.writes;

    await orchestrator.pollNow();

    expect(stateStore.writes).toBe(writesBeforeStableTick);
    await orchestrator.stop();
  });

  it('never retries an ambiguous missing start automatically', async () => {
    const api = new FakeImmichApi(makeQueue(false, 0));
    api.failStart = true;
    const fixture = await createFixture(api, makeConfig(true));
    await fixture.orchestrator.processBacklog();
    await fixture.orchestrator.pollNow();
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.phase).toBe('AMBIGUOUS_START');
    expect(api.startCalls).toBe(1);
    await fixture.orchestrator.pollNow();
    expect(api.startCalls).toBe(1);
    await fixture.orchestrator.stop();
  });

  it('defers an Immich missing scan while the queue is already active instead of treating HTTP 400 as ambiguous', async () => {
    const api = new FakeImmichApi(makeQueue(false, 0));
    api.startError = new ImmichApiError(
      'Immich returned HTTP 400: PUT /jobs/metadataExtraction',
      400,
      JSON.stringify({ message: 'Job is already running', statusCode: 400 }),
    );
    const fixture = await createFixture(api, makeConfig(true));
    await fixture.orchestrator.processBacklog();
    await fixture.orchestrator.pollNow();
    await fixture.orchestrator.pollNow();

    expect(fixture.orchestrator.status().state?.run?.phase).toBe('DISCOVERING');
    expect(fixture.orchestrator.status().state?.run?.stages[0]?.discoveryStatus).toBe('pending');
    expect(api.startCalls).toBe(1);

    api.startError = null;
    fixture.clock.advance(1);
    await fixture.orchestrator.pollNow();
    expect(fixture.orchestrator.status().state?.run?.stages[0]?.discoveryStatus).toBe('running');
    expect(api.startCalls).toBe(2);
    await fixture.orchestrator.stop();
  });

  it('pauses on a definitive Immich client rejection instead of calling it ambiguous', async () => {
    const api = new FakeImmichApi(makeQueue(false, 0));
    api.startError = new ImmichApiError(
      'Immich returned HTTP 403: PUT /jobs/metadataExtraction',
      403,
      JSON.stringify({ message: 'Forbidden' }),
    );
    const fixture = await createFixture(api, makeConfig(true));
    await fixture.orchestrator.processBacklog();
    await fixture.orchestrator.pollNow();
    await fixture.orchestrator.pollNow();

    expect(fixture.orchestrator.status().state?.run?.phase).toBe('PAUSED_BY_OPERATOR');
    expect(fixture.orchestrator.status().state?.run?.lastError).toContain('Forbidden');
    expect(api.startCalls).toBe(1);
    await fixture.orchestrator.stop();
  });

  it('commits an idempotent pause action from observed state after restart', async () => {
    const api = new FakeImmichApi(makeQueue(false, 0));
    const config = makeConfig(false);
    const fixture = await createFixture(api, config);
    await fixture.orchestrator.processBacklog();
    const runId = fixture.orchestrator.status().state?.run?.id;
    expect(runId).toBeTruthy();
    const journal = new ActionJournal(fixture.directory);
    await journal.initialize();
    await journal.prepare({
      runId: runId!,
      action: 'pause',
      queue: 'metadataExtraction',
      beforePaused: false,
      desiredPaused: true,
      reason: 'simulated crash after API call',
    });
    await fixture.orchestrator.stop();

    const restarted = await initializeOrchestrator(fixture.directory, api, config, () => fixture.clock.now());
    expect(restarted.status().state?.run?.phase).toBe('DISCOVERING');
    expect(await journal.openActions(runId)).toHaveLength(0);
    await restarted.stop();
  });

  it('turns an unproven start intent into an operator gate after restart', async () => {
    const api = new FakeImmichApi(makeQueue(false, 0));
    const config = makeConfig(true);
    const fixture = await createFixture(api, config);
    await fixture.orchestrator.processBacklog();
    const runId = fixture.orchestrator.status().state?.run?.id;
    expect(runId).toBeTruthy();
    const journal = new ActionJournal(fixture.directory);
    await journal.initialize();
    await journal.prepare({
      runId: runId!,
      action: 'start-missing',
      queue: 'metadataExtraction',
      beforePaused: true,
      desiredPaused: null,
      reason: 'simulated crash around legacy start',
    });
    await fixture.orchestrator.stop();

    const restarted = await initializeOrchestrator(fixture.directory, api, config, () => fixture.clock.now());
    expect(restarted.status().state?.run?.phase).toBe('AMBIGUOUS_START');
    expect(api.startCalls).toBe(0);
    await restarted.stop();
  });

  it('rebuilds and scans a persisted guarded-idle stage list after an upgrade', async () => {
    const api = new FakeImmichApi(makeQueue(true, 0));
    const config = makeConfig(false);
    const fixture = await createFixture(api, config);
    await fixture.orchestrator.armAutopilot();
    await pollUntilPhase(fixture, 'GUARDED_IDLE');
    await fixture.orchestrator.stop();

    const store = new StateStore(fixture.directory);
    const persisted = await store.load();
    expect(persisted.run).not.toBeNull();
    persisted.run!.stages[0]!.id = 'old-storage-stage';
    persisted.run!.stages[0]!.queue = 'storageTemplateMigration';
    await store.save(persisted);

    const restarted = await initializeOrchestrator(fixture.directory, api, config, () => fixture.clock.now());
    expect(restarted.status().state?.run?.stages.map((stage) => stage.queue)).toEqual(['metadataExtraction']);
    expect(restarted.status().state?.run?.phase).toBe('DISCOVERING');
    await restarted.stop();
  });
});

class FakeImmichApi implements ImmichApi {
  readonly mutations: string[] = [];
  startCalls = 0;
  failStart = false;
  startError: Error | null = null;
  missingOnDiscovery = 0;
  discoveryPending = false;
  statistics: ServerStatistics = { photos: 100, videos: 10, usage: 1_000_000 };
  features: ServerFeatures = { smartSearch: false, duplicateDetection: false, facialRecognition: false, ocr: false };

  constructor(readonly queue: QueueSnapshot, readonly additionalQueues: QueueSnapshot[] = []) {}

  getVersion(): Promise<ServerVersion> {
    return Promise.resolve({ major: 3, minor: 1, patch: 0 });
  }
  getFeatures(): Promise<ServerFeatures> {
    return Promise.resolve(structuredClone(this.features));
  }
  getServerStatistics(): Promise<ServerStatistics> {
    return Promise.resolve(structuredClone(this.statistics));
  }
  getQueues(): Promise<QueueSnapshot[]> {
    return Promise.resolve(structuredClone([this.queue, ...this.additionalQueues]));
  }
  getQueue(name: QueueName): Promise<QueueSnapshot> {
    return Promise.resolve(structuredClone(this.findQueue(name)));
  }
  setQueuePaused(name: QueueName, isPaused: boolean): Promise<QueueSnapshot> {
    const queue = this.findQueue(name);
    queue.isPaused = isPaused;
    this.mutations.push(`${isPaused ? 'pause' : 'resume'}:${name}`);
    if (!isPaused && queue.statistics.waiting > 0) {
      queue.statistics.completed += queue.statistics.waiting;
      queue.statistics.waiting = 0;
      queue.statistics.paused = 0;
    }
    return Promise.resolve(structuredClone(queue));
  }
  getQueueJobs(): Promise<QueueJob[]> {
    return Promise.resolve(
      this.discoveryPending
        ? [{ name: 'AssetExtractMetadataQueueAll', data: {}, timestamp: Date.parse('2026-08-01T00:00:00Z') }]
        : [],
    );
  }
  startMissing(): Promise<void> {
    this.startCalls += 1;
    if (this.startError) return Promise.reject(this.startError);
    if (this.failStart) return Promise.reject(new Error('socket closed after request'));
    this.discoveryPending = true;
    return Promise.resolve();
  }
  unknownQueueNames(): readonly string[] {
    return [];
  }
  addUpload(count: number): void {
    this.statistics.photos += count;
    this.statistics.usage += count * 1_000;
    this.queue.statistics.waiting += count;
  }
  finishDiscovery(): void {
    this.discoveryPending = false;
    this.queue.statistics.waiting += this.missingOnDiscovery;
    this.missingOnDiscovery = 0;
  }

  private findQueue(name: QueueName): QueueSnapshot {
    const queue = [this.queue, ...this.additionalQueues].find((candidate) => candidate.name === name);
    if (!queue) throw new Error(`Unknown fake queue: ${name}`);
    return queue;
  }
}

class CountingStateStore extends StateStore {
  writes = 0;

  override async save(state: PersistentState): Promise<void> {
    this.writes += 1;
    await super.save(state);
  }
}

class FixedCpuMonitor extends CpuMonitor {
  #running = false;

  constructor(readonly value: number) {
    super(60_000, 60_000);
  }

  override start(): void {
    this.#running = true;
  }

  override stop(): void {
    this.#running = false;
  }

  override isRunning(): boolean {
    return this.#running;
  }

  override status() {
    return {
      monitoring: this.#running,
      available: this.#running,
      currentPercent: this.#running ? this.value : null,
      averagePercent: this.#running ? this.value : null,
      peakPercent: this.#running ? this.value : null,
      sampledAt: this.#running ? '2026-08-01T00:00:00.000Z' : null,
    };
  }
}

function makeConfig(allowLegacyStart: boolean, loadGuardMode: 'off' | 'observe' = 'off'): AppConfig {
  return parseConfig({
    dryRun: false,
    control: { enabled: true },
    api: { allowLegacyStart },
    scheduler: {
      managedQueues: ['metadataExtraction'],
      pollInterval: 1,
      quietPeriod: 1,
      startSettlePeriod: 1,
    },
    capture: { uploadQuietPeriod: 10 },
    autopilot: { autoEndAfter: 10, minimumCaptureTime: 1 },
    loadGuard: { mode: loadGuardMode },
    pipeline: [
      {
        id: 'metadata',
        queue: 'metadataExtraction',
        dependsOn: [],
        startMissing: true,
        resourceGroup: 'cpu-io',
      },
    ],
  });
}

function makePriorityConfig(): AppConfig {
  return parseConfig({
    dryRun: false,
    control: { enabled: true },
    api: { allowLegacyStart: false },
    scheduler: {
      managedQueues: ['metadataExtraction', 'ocr'],
      pollInterval: 1,
      quietPeriod: 1,
      startSettlePeriod: 1,
    },
    loadGuard: { mode: 'off' },
    pipeline: [
      {
        id: 'metadata',
        queue: 'metadataExtraction',
        dependsOn: [],
        startMissing: true,
        resourceGroup: 'cpu-io',
      },
      {
        id: 'ocr',
        queue: 'ocr',
        dependsOn: [],
        startMissing: true,
        resourceGroup: 'ml-text',
        feature: 'ocr',
      },
    ],
  });
}

function makeFacePriorityConfig(): AppConfig {
  return parseConfig({
    dryRun: false,
    control: { enabled: true },
    api: { allowLegacyStart: false },
    scheduler: {
      managedQueues: ['faceDetection', 'facialRecognition'],
      pollInterval: 1,
      quietPeriod: 1,
      startSettlePeriod: 1,
    },
    loadGuard: { mode: 'off' },
    pipeline: [
      {
        id: 'face-detection',
        queue: 'faceDetection',
        dependsOn: [],
        startMissing: true,
        resourceGroup: 'ml-vision',
        feature: 'facialRecognition',
      },
      {
        id: 'facial-recognition',
        queue: 'facialRecognition',
        dependsOn: ['face-detection'],
        startMissing: true,
        resourceGroup: 'ml-vision',
        feature: 'facialRecognition',
      },
    ],
  });
}

async function createFixture(
  api: FakeImmichApi,
  config: AppConfig,
  configureSettings?: (settings: RuntimeSettings) => void,
): Promise<{
  orchestrator: QueueOrchestrator;
  directory: string;
  clock: { advance(milliseconds: number): void; now(): Date };
}> {
  const directory = await mkdtemp(join(tmpdir(), 'immich-orchestrator-test-'));
  temporaryDirectories.push(directory);
  let timestamp = Date.parse('2026-08-01T00:00:00Z');
  const clock = {
    advance: (milliseconds: number) => (timestamp += milliseconds),
    now: () => new Date(timestamp),
  };
  const settings = testSettings(config);
  configureSettings?.(settings);
  const orchestrator = await initializeOrchestrator(directory, api, config, clock.now, settings);
  return { orchestrator, directory, clock };
}

async function initializeOrchestrator(
  directory: string,
  api: FakeImmichApi,
  config: AppConfig,
  now: () => Date,
  settings: RuntimeSettings = testSettings(config),
): Promise<QueueOrchestrator> {
  const orchestrator = new QueueOrchestrator({
    config,
    api,
    stateStore: new StateStore(directory),
    journal: new ActionJournal(directory),
    cpuMonitor: new CpuMonitor(10_000, 30_000, now),
    logger: silentLogger,
    adminPassword: 'test-password',
    settings,
    now,
  });
  await orchestrator.initialize();
  return orchestrator;
}

function testSettings(config: AppConfig) {
  const settings = defaultRuntimeSettings(config);
  settings.automation.inventoryHoldMs = 0;
  settings.automation.discoverySettleMs = 1;
  settings.automation.discoveryTimeoutMs = 10_000;
  settings.automation.transientCounterStabilizationEnabled = false;
  return settings;
}

async function pollUntilPhase(
  fixture: { orchestrator: QueueOrchestrator; clock: { advance(milliseconds: number): void } },
  phase: string,
  maximumTicks = 30,
): Promise<void> {
  for (let tick = 0; tick < maximumTicks; tick += 1) {
    if (fixture.orchestrator.status().state?.run?.phase === phase) return;
    fixture.clock.advance(2);
    await fixture.orchestrator.pollNow();
  }
  expect(fixture.orchestrator.status().state?.run?.phase).toBe(phase);
}

function makeQueue(isPaused: boolean, waiting: number): QueueSnapshot {
  return makeQueueNamed('metadataExtraction', isPaused, waiting);
}

function makeQueueNamed(name: QueueName, isPaused: boolean, waiting: number): QueueSnapshot {
  return {
    name,
    isPaused,
    statistics: { active: 0, completed: 0, failed: 0, delayed: 0, waiting, paused: 0 },
  };
}

const silentLogger: AppLogger = {
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  configure: () => undefined,
  snapshot: () => ({ level: 'error', capacity: 100, dropped: 0, entries: [] }),
  clear: () => undefined,
};
