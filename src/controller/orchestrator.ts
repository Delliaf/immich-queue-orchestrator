import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config/schema.js';
import { enabledPipeline } from '../domain/pipeline.js';
import {
  QUEUE_ALL_JOB_NAMES,
  pendingJobs,
  queueIsQuietCandidate,
  type QueueName,
  type QueueSnapshot,
} from '../domain/queues.js';
import type { ImmichApi } from '../immich/client.js';
import type { ServerFeatures, ServerStatistics, ServerVersion } from '../immich/schemas.js';
import type { CpuMonitor, CpuStatus } from '../monitoring/cpu.js';
import { resolvePanelAuthentication, type EffectivePanelAuthentication } from '../security/authentication.js';
import type { ActionJournal, PreparedAction } from '../state/journal.js';
import {
  createStageRuntime,
  resetStages,
  type ActivitySnapshot,
  type ControllerPhase,
  type PersistentState,
  type RunMode,
  type RunState,
  type StageRuntime,
} from '../state/model.js';
import type { StateStore } from '../state/store.js';
import { ConflictError, ControlDisabledError, errorMessage } from '../utils/errors.js';
import { SerialExecutor } from '../utils/serial.js';

export interface AppLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface OrchestratorOptions {
  config: AppConfig;
  api: ImmichApi;
  stateStore: StateStore;
  journal: ActionJournal;
  cpuMonitor: CpuMonitor;
  logger: AppLogger;
  adminPassword: string | null;
  now?: () => Date;
}

export interface OrchestratorStatus {
  ready: boolean;
  apiConnected: boolean;
  fatalError: string | null;
  lastPollError: string | null;
  version: ServerVersion | null;
  features: ServerFeatures | null;
  serverStatistics: ServerStatistics | null;
  queues: QueueSnapshot[];
  unknownQueues: readonly string[];
  cpu: CpuStatus;
  state: PersistentState | null;
  control: {
    enabled: boolean;
    dryRun: boolean;
    authentication: EffectivePanelAuthentication;
    authenticatedActions: boolean;
  };
}

const TERMINAL_PHASES = new Set<ControllerPhase>([
  'IDLE',
  'PAUSED_BY_OPERATOR',
  'AMBIGUOUS_START',
  'DEGRADED',
  'COMPLETED',
]);

const CPU_MONITORED_PHASES = new Set<ControllerPhase>(['PROCESSING', 'RUNNING_STAGE', 'WAITING_FOR_QUIET']);

export class QueueOrchestrator {
  readonly #config: AppConfig;
  readonly #api: ImmichApi;
  readonly #store: StateStore;
  readonly #journal: ActionJournal;
  readonly #cpu: CpuMonitor;
  readonly #logger: AppLogger;
  readonly #adminPassword: string | null;
  readonly #authentication: EffectivePanelAuthentication;
  readonly #now: () => Date;
  readonly #serial = new SerialExecutor();
  #state: PersistentState | null = null;
  #queues: QueueSnapshot[] = [];
  #serverStatistics: ServerStatistics | null = null;
  #features: ServerFeatures | null = null;
  #version: ServerVersion | null = null;
  #fatalError: string | null = null;
  #lastPollError: string | null = null;
  #apiConnected = false;
  #ready = false;
  #running = false;
  #loopPromise: Promise<void> | null = null;
  #loopAbort: AbortController | null = null;
  #needsJournalReconciliation = false;

  constructor(options: OrchestratorOptions) {
    this.#config = options.config;
    this.#api = options.api;
    this.#store = options.stateStore;
    this.#journal = options.journal;
    this.#cpu = options.cpuMonitor;
    this.#logger = options.logger;
    const authentication = resolvePanelAuthentication(options.config.server.authentication, options.adminPassword);
    this.#adminPassword = authentication.password;
    this.#authentication = authentication.mode;
    this.#now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    await this.#journal.initialize();
    try {
      this.#state = await this.#store.initialize(this.#now());
    } catch (error) {
      this.#fatalError = errorMessage(error);
      this.#logger.error('State storage is invalid; controller is read-only', { error: this.#fatalError });
      await this.#observeApi();
      return;
    }

    try {
      await this.#observeApi();
      this.#validateCapabilities();
      if (this.#state.run) {
        if (this.#config.control.resumePersistedRun && this.#mutationsConfigured()) {
          await this.#reconcileJournal(this.#state.run, true);
        } else if (!TERMINAL_PHASES.has(this.#state.run.phase)) {
          this.#state.run.phase = 'PAUSED_BY_OPERATOR';
          this.#state.run.lastError = 'Persisted run found, but automatic resume is disabled or control is read-only';
          await this.#saveState();
        }
      }
      this.#ready = true;
    } catch (error) {
      this.#fatalError = errorMessage(error);
      this.#logger.error('Initialization validation failed; controller is read-only', { error: this.#fatalError });
    }
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#loopAbort = new AbortController();
    this.#loopPromise = this.#loop(this.#loopAbort.signal);
  }

  async stop(): Promise<void> {
    this.#running = false;
    this.#loopAbort?.abort();
    await this.#loopPromise;
    this.#cpu.stop();
  }

  status(): OrchestratorStatus {
    return {
      ready: this.#ready,
      apiConnected: this.#apiConnected,
      fatalError: this.#fatalError,
      lastPollError: this.#lastPollError,
      version: this.#version,
      features: this.#features,
      serverStatistics: this.#serverStatistics,
      queues: structuredClone(this.#queues),
      unknownQueues: [...this.#api.unknownQueueNames()],
      cpu: this.#cpu.status(),
      state: this.#state ? structuredClone(this.#state) : null,
      control: {
        enabled: this.#config.control.enabled,
        dryRun: this.#config.dryRun,
        authentication: this.#authentication,
        authenticatedActions: this.#authentication === 'none' || this.#adminPassword !== null,
      },
    };
  }

  effectiveConfig(): AppConfig {
    return structuredClone(this.#config);
  }

  isAuthorized(candidate: string | undefined): boolean {
    if (this.#authentication === 'none') return true;
    if (!this.#adminPassword || !candidate) return false;
    const expected = Buffer.from(this.#adminPassword);
    const actual = Buffer.from(candidate);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  processBacklog(): Promise<void> {
    return this.#serial.run(async () => {
      await this.#startRun('manual-session');
      await this.#runTick();
    });
  }

  pollNow(): Promise<void> {
    return this.#serial.run(() => this.#runTick());
  }

  captureBegin(): Promise<void> {
    return this.#serial.run(async () => {
      await this.#startRun('capture-assisted');
      await this.#runTick();
    });
  }

  captureEnd(): Promise<void> {
    return this.#serial.run(async () => {
      const run = this.#requireRun();
      if (run.phase !== 'CAPTURING_UPLOADS' || !['capture-assisted', 'autopilot'].includes(run.mode)) {
        throw new ConflictError('No capture session is waiting for an end signal');
      }
      run.captureEndRequested = true;
      run.updatedAt = this.#nowIso();
      await this.#saveState();
      await this.#runTick();
    });
  }

  armAutopilot(): Promise<void> {
    return this.#serial.run(async () => {
      if (!this.#config.autopilot.available) throw new ConflictError('Autopilot is disabled by configuration');
      await this.#startRun('autopilot');
      const state = this.#requireState();
      state.autopilotArmed = true;
      await this.#saveState();
      await this.#runTick();
    });
  }

  pauseController(): Promise<void> {
    return this.#serial.run(async () => {
      this.#assertMutationsAllowed();
      const run = this.#requireRun();
      if (run.phase === 'AMBIGUOUS_START') {
        throw new ConflictError('Resolve or abort the ambiguous start before pausing the controller');
      }
      await this.#refreshObservation();
      for (const queue of this.#managedQueueSnapshots()) {
        await this.#setQueuePaused(run, queue, true, 'operator paused controller');
      }
      run.phase = 'PAUSED_BY_OPERATOR';
      run.lastError = 'Controller paused by operator';
      this.#requireState().pausedByOperator = true;
      await this.#saveState();
    });
  }

  resumeController(): Promise<void> {
    return this.#serial.run(async () => {
      this.#assertMutationsAllowed();
      const run = this.#requireRun();
      if (run.phase !== 'PAUSED_BY_OPERATOR') throw new ConflictError('Controller is not paused');
      await this.#refreshObservation();
      for (const queue of this.#managedQueueSnapshots()) {
        await this.#setQueuePaused(run, queue, true, 'operator explicitly resumed controller');
      }
      this.#requireState().pausedByOperator = false;
      run.lastError = null;
      run.phase = run.mode === 'autopilot' ? 'CAPTURING_UPLOADS' : 'PROCESSING';
      run.lastActivityAt = this.#nowIso();
      await this.#saveState();
      await this.#runTick();
    });
  }

  release(): Promise<void> {
    return this.#serial.run(async () => {
      this.#assertMutationsAllowed();
      const state = this.#requireState();
      const run = this.#requireRun();
      run.phase = 'RELEASING';
      await this.#saveState();
      await this.#refreshObservation();
      await this.#restoreOriginalStates(run);
      state.autopilotArmed = false;
      state.pausedByOperator = false;
      state.run = null;
      await this.#saveState();
    });
  }

  resolveAmbiguous(decision: 'assume-sent' | 'retry-start' | 'abort'): Promise<void> {
    return this.#serial.run(async () => {
      this.#assertMutationsAllowed();
      const run = this.#requireRun();
      if (run.phase !== 'AMBIGUOUS_START') throw new ConflictError('No ambiguous start is awaiting a decision');
      if (decision === 'abort') {
        await this.#releaseCurrentRun();
        return;
      }
      const action = await this.#journal.latestAmbiguousAction(run.id);
      if (!action || action.action !== 'start-missing') throw new Error('Ambiguous journal action was not found');
      if (decision === 'assume-sent') {
        await this.#journal.appendTransition(action, 'COMMITTED', 'operator assumed request was sent', this.#now());
      } else {
        await this.#journal.appendTransition(action, 'FAILED', 'operator explicitly requested retry', this.#now());
        run.phase = 'RUNNING_STAGE';
        run.lastError = null;
        const committed = await this.#startMissing(run, action.queue, 'operator explicitly retried ambiguous missing pass');
        if (!committed) return;
      }
      const stage = run.stages.find((candidate) => candidate.queue === action.queue && !candidate.repairAttempted);
      if (stage) {
        stage.repairAttempted = true;
        stage.status = 'repair-settling';
        stage.settleUntil = new Date(this.#now().getTime() + this.#config.scheduler.startSettlePeriodMs).toISOString();
      }
      run.phase = 'RUNNING_STAGE';
      run.lastError = null;
      await this.#saveState();
    });
  }

  async #loop(signal: AbortSignal): Promise<void> {
    while (this.#running && !signal.aborted) {
      await this.#serial.run(() => this.#runTick()).catch((error: unknown) => {
        this.#lastPollError = errorMessage(error);
        this.#logger.warn('Controller tick failed', { error: this.#lastPollError });
      });
      await wait(this.#nextPollIntervalMs(), signal);
    }
  }

  async #runTick(): Promise<void> {
    this.#syncCpuMonitoring();
    try {
      await this.#tick();
    } finally {
      this.#syncCpuMonitoring();
    }
  }

  async #tick(): Promise<void> {
    if (!this.#state || this.#fatalError) return;
    await this.#refreshObservation();
    const run = this.#state.run;
    if (!run || TERMINAL_PHASES.has(run.phase)) return;

    if (this.#needsJournalReconciliation) await this.#reconcileJournal(run, false);
    if (run.phase === 'AMBIGUOUS_START' || run.phase === 'PAUSED_BY_OPERATOR') return;
    if (run.phase !== 'PREPARING' && run.phase !== 'RELEASING') {
      const override = this.#findManualOverride(run);
      if (override) {
        run.phase = 'PAUSED_BY_OPERATOR';
        run.lastError = override;
        this.#state.pausedByOperator = true;
        await this.#saveState();
        this.#logger.warn('Manual queue override detected; controller stopped', { error: override });
        return;
      }
    }

    switch (run.phase) {
      case 'PREPARING':
        await this.#prepareRun(run);
        break;
      case 'GUARDED_IDLE':
        await this.#tickGuardedIdle(run);
        break;
      case 'CAPTURING_UPLOADS':
        await this.#tickCapture(run);
        break;
      case 'PROCESSING':
      case 'RUNNING_STAGE':
      case 'WAITING_FOR_QUIET':
        await this.#tickProcessing(run);
        break;
      case 'RELEASING':
        await this.#restoreOriginalStates(run);
        this.#state.run = null;
        await this.#saveState();
        break;
      default:
        break;
    }
  }

  async #startRun(mode: RunMode): Promise<void> {
    this.#assertMutationsAllowed();
    const state = this.#requireState();
    if (state.run && !['COMPLETED', 'IDLE'].includes(state.run.phase)) {
      throw new ConflictError(`A run is already active in phase ${state.run.phase}`);
    }
    await this.#refreshObservation();
    if (!this.#features || !this.#serverStatistics) throw new Error('Immich capabilities are unavailable');
    const now = this.#nowIso();
    const originalQueueStates: Partial<Record<QueueName, boolean>> = {};
    for (const queue of this.#managedQueueSnapshots()) originalQueueStates[queue.name] = queue.isPaused;
    const stages = enabledPipeline(this.#config.pipeline, this.#features).map(createStageRuntime);
    state.run = {
      id: randomUUID(),
      mode,
      phase: 'PREPARING',
      createdAt: now,
      updatedAt: now,
      originalQueueStates,
      desiredQueueStates: { ...originalQueueStates },
      stages,
      currentStageIndex: 0,
      captureStartedAt: mode === 'manual-session' ? null : now,
      captureEndRequested: false,
      lastActivityAt: mode === 'manual-session' ? null : now,
      lastActivity: this.#activitySnapshot(now),
      lastObservedAssets: assetCount(this.#serverStatistics),
      lastError: null,
      loadThrottled: false,
      loadHighSince: null,
      loadLowSince: null,
    };
    state.pausedByOperator = false;
    if (mode !== 'autopilot') state.autopilotArmed = false;
    await this.#saveState();
    this.#logger.info('Created controller run', { runId: state.run.id, mode });
  }

  async #prepareRun(run: RunState): Promise<void> {
    for (const queue of this.#managedQueueSnapshots()) {
      await this.#setQueuePaused(run, queue, true, 'prepare run: guard managed queues');
    }
    const now = this.#nowIso();
    run.lastActivity = this.#activitySnapshot(now);
    run.lastObservedAssets = this.#serverStatistics ? assetCount(this.#serverStatistics) : run.lastObservedAssets;
    if (run.mode === 'manual-session') {
      run.phase = 'PROCESSING';
      run.stages = resetStages(run.stages);
      run.currentStageIndex = 0;
    } else if (run.mode === 'autopilot' && this.#totalPending() === 0) {
      run.phase = 'GUARDED_IDLE';
      run.captureStartedAt = null;
      run.lastActivityAt = null;
    } else {
      run.phase = 'CAPTURING_UPLOADS';
      run.captureStartedAt = now;
      run.lastActivityAt = now;
    }
    run.updatedAt = now;
    await this.#saveState();
  }

  async #tickGuardedIdle(run: RunState): Promise<void> {
    const currentAssets = this.#serverStatistics ? assetCount(this.#serverStatistics) : run.lastObservedAssets;
    if (this.#totalPending() > 0 || currentAssets > run.lastObservedAssets) {
      const now = this.#nowIso();
      run.phase = 'CAPTURING_UPLOADS';
      run.captureStartedAt = now;
      run.lastActivityAt = now;
      run.lastActivity = this.#activitySnapshot(now);
      run.lastObservedAssets = currentAssets;
      run.updatedAt = now;
      await this.#saveState();
      this.#logger.info('Autopilot detected new upload work; capture timer started', { runId: run.id });
      return;
    }
    run.lastObservedAssets = currentAssets;
  }

  async #tickCapture(run: RunState): Promise<void> {
    const now = this.#now();
    const snapshot = this.#activitySnapshot(now.toISOString());
    const previous = run.lastActivity;
    if (
      !previous ||
      snapshot.assets > previous.assets ||
      snapshot.usage > previous.usage ||
      snapshot.pendingTotal > previous.pendingTotal
    ) {
      run.lastActivityAt = now.toISOString();
      run.lastActivity = snapshot;
      run.lastObservedAssets = snapshot.assets;
      run.updatedAt = now.toISOString();
      await this.#saveState();
      return;
    }
    run.lastObservedAssets = snapshot.assets;
    const lastActivityAt = run.lastActivityAt ? Date.parse(run.lastActivityAt) : now.getTime();
    const captureStartedAt = run.captureStartedAt ? Date.parse(run.captureStartedAt) : now.getTime();
    const quietRequired = run.mode === 'autopilot' ? this.#config.autopilot.autoEndAfterMs : this.#config.capture.uploadQuietPeriodMs;
    const canAutoEnd = run.mode === 'autopilot' || run.captureEndRequested;
    if (
      canAutoEnd &&
      now.getTime() - lastActivityAt >= quietRequired &&
      now.getTime() - captureStartedAt >= this.#config.autopilot.minimumCaptureTimeMs
    ) {
      run.stages = resetStages(run.stages);
      run.currentStageIndex = 0;
      run.phase = 'PROCESSING';
      run.updatedAt = now.toISOString();
      await this.#saveState();
      this.#logger.info('Upload quiet period completed; processing pass started', { runId: run.id });
    }
  }

  async #tickProcessing(run: RunState): Promise<void> {
    const currentAssets = this.#serverStatistics ? assetCount(this.#serverStatistics) : run.lastObservedAssets;
    if (['autopilot', 'capture-assisted'].includes(run.mode) && currentAssets > run.lastObservedAssets) {
      await this.#returnToCapture(run, currentAssets);
      return;
    }
    run.lastObservedAssets = currentAssets;

    if (await this.#applyLoadGuard(run)) return;
    const stage = run.stages[run.currentStageIndex];
    if (!stage) {
      await this.#completeRun(run);
      return;
    }
    const queue = this.#queueByName(stage.queue);
    if (!queue) throw new Error(`Managed queue disappeared: ${stage.queue}`);
    if (['draining', 'repairing'].includes(stage.status) && queue.isPaused && !run.loadThrottled) {
      await this.#setQueuePaused(run, queue, false, `resume stage ${stage.id} after load guard`);
      await this.#saveState();
      return;
    }

    switch (stage.status) {
      case 'pending':
        await this.#startOrCompleteStage(run, stage, queue);
        break;
      case 'draining':
        await this.#drainStage(run, stage, queue, true);
        break;
      case 'repair-settling':
        if (stage.settleUntil && this.#now().getTime() >= Date.parse(stage.settleUntil)) {
          stage.status = 'repairing';
          stage.quietSince = null;
          run.phase = 'RUNNING_STAGE';
          run.updatedAt = this.#nowIso();
          await this.#saveState();
        }
        break;
      case 'repairing':
        await this.#drainStage(run, stage, queue, false);
        break;
      case 'completed':
        run.currentStageIndex += 1;
        run.phase = 'PROCESSING';
        await this.#saveState();
        break;
    }
  }

  async #startOrCompleteStage(run: RunState, stage: StageRuntime, queue: QueueSnapshot): Promise<void> {
    if (pendingJobs(queue) > 0) {
      await this.#setQueuePaused(run, queue, false, `drain stage ${stage.id}`);
      stage.status = 'draining';
      stage.quietSince = null;
      run.phase = 'RUNNING_STAGE';
      await this.#saveState();
      return;
    }
    if (this.#shouldRepair(stage)) {
      if (queue.isPaused) {
        await this.#setQueuePaused(run, queue, false, `prepare missing repair for ${stage.id}`);
        await this.#saveState();
        return;
      }
      await this.#launchRepair(run, stage);
      return;
    }
    await this.#finishStage(run, stage, queue);
  }

  async #drainStage(run: RunState, stage: StageRuntime, queue: QueueSnapshot, allowRepair: boolean): Promise<void> {
    if (!queueIsQuietCandidate(queue)) {
      if (stage.quietSince !== null) {
        stage.quietSince = null;
        run.phase = 'RUNNING_STAGE';
        await this.#saveState();
      }
      return;
    }
    const now = this.#now();
    if (!stage.quietSince) {
      stage.quietSince = now.toISOString();
      run.phase = 'WAITING_FOR_QUIET';
      await this.#saveState();
      return;
    }
    if (now.getTime() - Date.parse(stage.quietSince) < this.#config.scheduler.quietPeriodMs) return;
    if (allowRepair && this.#shouldRepair(stage)) {
      await this.#launchRepair(run, stage);
      return;
    }
    await this.#finishStage(run, stage, queue);
  }

  async #launchRepair(run: RunState, stage: StageRuntime): Promise<void> {
    const queue = this.#queueByName(stage.queue);
    if (!queue || pendingJobs(queue) !== 0) {
      throw new ConflictError(`Refusing missing repair while ${stage.queue} has pending work`);
    }
    const committed = await this.#startMissing(run, stage.queue, `missing repair for stage ${stage.id}`);
    if (!committed) return;
    stage.repairAttempted = true;
    stage.status = 'repair-settling';
    stage.quietSince = null;
    stage.settleUntil = new Date(this.#now().getTime() + this.#config.scheduler.startSettlePeriodMs).toISOString();
    run.phase = 'RUNNING_STAGE';
    await this.#saveState();
  }

  async #finishStage(run: RunState, stage: StageRuntime, queue: QueueSnapshot): Promise<void> {
    await this.#setQueuePaused(run, queue, true, `stage ${stage.id} completed`);
    stage.status = 'completed';
    stage.completedAt = this.#nowIso();
    stage.quietSince = null;
    run.currentStageIndex += 1;
    run.phase = 'PROCESSING';
    run.updatedAt = this.#nowIso();
    await this.#saveState();
  }

  async #completeRun(run: RunState): Promise<void> {
    const state = this.#requireState();
    const now = this.#nowIso();
    if (run.mode === 'autopilot') {
      await this.#refreshObservation();
      for (const queue of this.#managedQueueSnapshots()) {
        await this.#setQueuePaused(run, queue, true, 'autopilot returns to guarded idle');
      }
      run.phase = 'GUARDED_IDLE';
      run.currentStageIndex = 0;
      run.stages = resetStages(run.stages);
      run.captureStartedAt = null;
      run.lastActivityAt = null;
      run.lastActivity = this.#activitySnapshot(now);
      run.lastObservedAssets = this.#serverStatistics ? assetCount(this.#serverStatistics) : run.lastObservedAssets;
      run.updatedAt = now;
      await this.#saveState();
      this.#logger.info('Autopilot pass completed; guarded idle restored', { runId: run.id });
      return;
    }
    await this.#restoreOriginalStates(run);
    run.phase = 'COMPLETED';
    run.updatedAt = now;
    state.lastCompletedRun = { id: run.id, mode: run.mode, completedAt: now };
    await this.#saveState();
    this.#logger.info('Controller run completed', { runId: run.id, mode: run.mode });
  }

  async #returnToCapture(run: RunState, currentAssets: number): Promise<void> {
    await this.#refreshObservation();
    for (const queue of this.#managedQueueSnapshots()) {
      await this.#setQueuePaused(run, queue, true, 'new upload detected during processing');
    }
    const now = this.#nowIso();
    run.phase = 'CAPTURING_UPLOADS';
    run.captureStartedAt = now;
    run.lastActivityAt = now;
    run.lastActivity = this.#activitySnapshot(now);
    run.lastObservedAssets = currentAssets;
    run.updatedAt = now;
    await this.#saveState();
    this.#logger.info('New upload detected during processing; returned to capture', { runId: run.id });
  }

  async #applyLoadGuard(run: RunState): Promise<boolean> {
    const config = this.#config.loadGuard;
    if (config.mode !== 'throttle' || config.pauseAbove === null || config.resumeBelow === null) return false;
    const average = this.#cpu.status().averagePercent;
    if (average === null) return false;
    const now = this.#now();
    let dirty = false;
    if (run.loadThrottled) {
      if (run.loadHighSince !== null) {
        run.loadHighSince = null;
        dirty = true;
      }
      if (average <= config.resumeBelow) {
        if (run.loadLowSince === null) {
          run.loadLowSince = now.toISOString();
          dirty = true;
        }
        if (now.getTime() - Date.parse(run.loadLowSince) >= config.resumeForMs) {
          run.loadThrottled = false;
          run.loadLowSince = null;
          await this.#saveState();
          this.#logger.info('CPU load guard released processing', { average });
          return false;
        }
      } else if (run.loadLowSince !== null) {
        run.loadLowSince = null;
        dirty = true;
      }
      if (dirty) await this.#saveState();
      return true;
    }
    if (run.loadLowSince !== null) {
      run.loadLowSince = null;
      dirty = true;
    }
    if (average >= config.pauseAbove) {
      if (run.loadHighSince === null) {
        run.loadHighSince = now.toISOString();
        dirty = true;
      }
      if (now.getTime() - Date.parse(run.loadHighSince) >= config.pauseForMs) {
        const stage = run.stages[run.currentStageIndex];
        const queue = stage ? this.#queueByName(stage.queue) : undefined;
        if (queue && !queue.isPaused) await this.#setQueuePaused(run, queue, true, 'CPU load guard throttled queue');
        run.loadThrottled = true;
        run.loadHighSince = null;
        await this.#saveState();
        this.#logger.warn('CPU load guard paused processing', { average });
        return true;
      }
    } else if (run.loadHighSince !== null) {
      run.loadHighSince = null;
      dirty = true;
    }
    if (dirty) await this.#saveState();
    return false;
  }

  #syncCpuMonitoring(): void {
    const run = this.#state?.run;
    const phase = run?.phase;
    const needed = this.#config.loadGuard.mode !== 'off' && phase !== undefined && CPU_MONITORED_PHASES.has(phase);
    if (needed) {
      if (!this.#cpu.isRunning() && run) {
        run.loadHighSince = null;
        run.loadLowSince = null;
        this.#cpu.start();
      }
    } else {
      this.#cpu.stop();
    }
  }

  #nextPollIntervalMs(): number {
    const phase = this.#state?.run?.phase;
    if (phase === 'GUARDED_IDLE') return this.#config.scheduler.guardedIdlePollIntervalMs;
    if (!phase || TERMINAL_PHASES.has(phase)) return this.#config.scheduler.standbyPollIntervalMs;
    return this.#config.scheduler.pollIntervalMs;
  }

  #shouldRepair(stage: StageRuntime): boolean {
    const definition = this.#config.pipeline.find((candidate) => candidate.id === stage.id);
    return Boolean(definition?.startMissing && this.#config.api.allowLegacyStart && !stage.repairAttempted);
  }

  async #setQueuePaused(run: RunState, queue: QueueSnapshot, desired: boolean, reason: string): Promise<void> {
    if (queue.isPaused === desired) {
      run.desiredQueueStates[queue.name] = desired;
      return;
    }
    const prepared = await this.#journal.prepare(
      {
        runId: run.id,
        action: desired ? 'pause' : 'resume',
        queue: queue.name,
        beforePaused: queue.isPaused,
        desiredPaused: desired,
        reason,
      },
      this.#now(),
    );
    this.#needsJournalReconciliation = true;
    const response = await this.#api.setQueuePaused(queue.name, desired);
    if (response.isPaused !== desired) {
      throw new Error(`Queue ${queue.name} verification failed: expected isPaused=${String(desired)}`);
    }
    await this.#journal.appendTransition(prepared, 'VERIFIED', null, this.#now());
    await this.#journal.appendTransition(prepared, 'COMMITTED', null, this.#now());
    this.#needsJournalReconciliation = false;
    run.desiredQueueStates[queue.name] = desired;
    this.#replaceQueue(response);
    run.updatedAt = this.#nowIso();
  }

  async #startMissing(run: RunState, queue: QueueName, reason: string): Promise<boolean> {
    const snapshot = this.#queueByName(queue);
    if (!snapshot || pendingJobs(snapshot) !== 0) {
      throw new ConflictError(`Refusing start missing while ${queue} has pending work`);
    }
    const prepared = await this.#journal.prepare(
      {
        runId: run.id,
        action: 'start-missing',
        queue,
        beforePaused: snapshot.isPaused,
        desiredPaused: null,
        reason,
      },
      this.#now(),
    );
    try {
      await this.#api.startMissing(queue);
      await this.#journal.appendTransition(prepared, 'VERIFIED', null, this.#now());
      await this.#journal.appendTransition(prepared, 'COMMITTED', null, this.#now());
      return true;
    } catch (error) {
      await this.#journal.appendTransition(prepared, 'AMBIGUOUS', errorMessage(error), this.#now());
      run.phase = 'AMBIGUOUS_START';
      run.lastError = `Ambiguous start missing for ${queue}: ${errorMessage(error)}`;
      await this.#saveState();
      return false;
    }
  }

  async #reconcileJournal(run: RunState, replayCommitted: boolean): Promise<void> {
    if (replayCommitted) {
      const committedStates = await this.#journal.latestCommittedPauseStates(run.id);
      Object.assign(run.desiredQueueStates, committedStates);
      const committedStarts = new Set(await this.#journal.committedStartQueues(run.id));
      for (const stage of run.stages) {
        if (committedStarts.has(stage.queue) && !stage.repairAttempted) stage.repairAttempted = true;
      }
    }
    const actions = await this.#journal.openActions(run.id);
    for (const action of actions) {
      if (action.action === 'start-missing') {
        if (await this.#hasStartEvidence(action)) {
          await this.#journal.appendTransition(action, 'VERIFIED', 'recovered from queue evidence', this.#now());
          await this.#journal.appendTransition(action, 'COMMITTED', 'recovered from queue evidence', this.#now());
          const stage = run.stages.find((candidate) => candidate.queue === action.queue && !candidate.repairAttempted);
          if (stage) stage.repairAttempted = true;
        } else {
          await this.#journal.appendTransition(action, 'AMBIGUOUS', 'no conclusive queue evidence after restart', this.#now());
          run.phase = 'AMBIGUOUS_START';
          run.lastError = `Ambiguous start missing for ${action.queue}; operator decision required`;
          await this.#saveState();
          this.#needsJournalReconciliation = false;
          return;
        }
        continue;
      }
      await this.#reconcilePauseAction(run, action);
    }
    this.#needsJournalReconciliation = false;
    await this.#saveState();
  }

  async #reconcilePauseAction(run: RunState, action: PreparedAction): Promise<void> {
    if (action.desiredPaused === null || action.beforePaused === null) throw new Error('Invalid pause journal action');
    let observed = await this.#api.getQueue(action.queue);
    if (observed.isPaused === action.desiredPaused) {
      await this.#journal.appendTransition(action, 'VERIFIED', 'reconciled from observed desired state', this.#now());
      await this.#journal.appendTransition(action, 'COMMITTED', 'reconciled from observed desired state', this.#now());
      run.desiredQueueStates[action.queue] = action.desiredPaused;
      this.#replaceQueue(observed);
      return;
    }
    if (observed.isPaused !== action.beforePaused) {
      run.phase = 'PAUSED_BY_OPERATOR';
      run.lastError = `Queue ${action.queue} changed externally during action recovery`;
      await this.#saveState();
      return;
    }
    observed = await this.#api.setQueuePaused(action.queue, action.desiredPaused);
    if (observed.isPaused !== action.desiredPaused) throw new Error(`Failed to reconcile ${action.queue}`);
    await this.#journal.appendTransition(action, 'VERIFIED', 'idempotent action replayed', this.#now());
    await this.#journal.appendTransition(action, 'COMMITTED', 'idempotent action replayed', this.#now());
    run.desiredQueueStates[action.queue] = action.desiredPaused;
    this.#replaceQueue(observed);
  }

  async #hasStartEvidence(action: PreparedAction): Promise<boolean> {
    const queue = await this.#api.getQueue(action.queue);
    if (pendingJobs(queue) > 0) return true;
    const expectedName = QUEUE_ALL_JOB_NAMES[action.queue];
    if (!expectedName) return false;
    const jobs = await this.#api.getQueueJobs(action.queue, ['active', 'waiting', 'paused', 'delayed', 'completed']);
    const preparedAt = Date.parse(action.preparedAt);
    return jobs.some((job) => job.name === expectedName && job.timestamp >= preparedAt - 5_000);
  }

  async #releaseCurrentRun(): Promise<void> {
    const state = this.#requireState();
    const run = this.#requireRun();
    run.phase = 'RELEASING';
    await this.#saveState();
    await this.#refreshObservation();
    await this.#restoreOriginalStates(run);
    state.autopilotArmed = false;
    state.pausedByOperator = false;
    state.run = null;
    await this.#saveState();
  }

  async #restoreOriginalStates(run: RunState): Promise<void> {
    await this.#refreshObservation();
    for (const queue of this.#managedQueueSnapshots()) {
      const original = run.originalQueueStates[queue.name];
      if (original === undefined) continue;
      await this.#setQueuePaused(run, queue, original, 'restore original queue state');
    }
  }

  #findManualOverride(run: RunState): string | null {
    for (const queue of this.#managedQueueSnapshots()) {
      const desired = run.desiredQueueStates[queue.name];
      if (desired !== undefined && desired !== queue.isPaused) {
        return `Queue ${queue.name} isPaused=${String(queue.isPaused)}, controller expected ${String(desired)}`;
      }
    }
    return null;
  }

  async #observeApi(): Promise<void> {
    try {
      const [version, features, queues, statistics] = await Promise.all([
        this.#api.getVersion(),
        this.#api.getFeatures(),
        this.#api.getQueues(),
        this.#api.getServerStatistics(),
      ]);
      this.#version = version;
      this.#features = features;
      this.#queues = queues;
      this.#serverStatistics = statistics;
      this.#apiConnected = true;
      this.#lastPollError = null;
    } catch (error) {
      this.#apiConnected = false;
      this.#lastPollError = errorMessage(error);
      throw error;
    }
  }

  async #refreshObservation(): Promise<void> {
    try {
      const [queues, statistics] = await Promise.all([this.#api.getQueues(), this.#api.getServerStatistics()]);
      this.#queues = queues;
      this.#serverStatistics = statistics;
      this.#apiConnected = true;
      this.#lastPollError = null;
    } catch (error) {
      this.#apiConnected = false;
      this.#lastPollError = errorMessage(error);
      throw error;
    }
  }

  #validateCapabilities(): void {
    if (!this.#version) throw new Error('Immich version is unavailable');
    if (
      this.#config.api.strictMajorVersion &&
      !this.#config.api.supportedMajorVersions.includes(this.#version.major)
    ) {
      throw new Error(`Unsupported Immich major version: ${this.#version.major}`);
    }
    const present = new Set(this.#queues.map((queue) => queue.name));
    const missing = this.#config.scheduler.managedQueues.filter((queue) => !present.has(queue));
    if (missing.length > 0) throw new Error(`Immich did not return managed queues: ${missing.join(', ')}`);
  }

  #activitySnapshot(timestamp: string): ActivitySnapshot {
    return {
      assets: this.#serverStatistics ? assetCount(this.#serverStatistics) : 0,
      usage: this.#serverStatistics?.usage ?? 0,
      pendingTotal: this.#totalPending(),
      capturedAt: timestamp,
    };
  }

  #totalPending(): number {
    return this.#managedQueueSnapshots().reduce((total, queue) => total + pendingJobs(queue), 0);
  }

  #managedQueueSnapshots(): QueueSnapshot[] {
    const managed = new Set(this.#config.scheduler.managedQueues);
    return this.#queues.filter((queue) => managed.has(queue.name));
  }

  #queueByName(name: QueueName): QueueSnapshot | undefined {
    return this.#queues.find((queue) => queue.name === name);
  }

  #replaceQueue(queue: QueueSnapshot): void {
    const index = this.#queues.findIndex((candidate) => candidate.name === queue.name);
    if (index === -1) this.#queues.push(queue);
    else this.#queues[index] = queue;
  }

  #mutationsConfigured(): boolean {
    return this.#config.control.enabled && !this.#config.dryRun && this.#fatalError === null;
  }

  #assertMutationsAllowed(): void {
    if (!this.#config.control.enabled) throw new ControlDisabledError('Control is disabled in configuration');
    if (this.#config.dryRun) throw new ControlDisabledError('Dry-run is enabled; mutations are blocked');
    if (this.#fatalError) throw new ControlDisabledError(`Controller is read-only: ${this.#fatalError}`);
    if (!this.#ready) throw new ControlDisabledError('Controller is not ready');
  }

  #requireState(): PersistentState {
    if (!this.#state) throw new Error('Persistent state is unavailable');
    return this.#state;
  }

  #requireRun(): RunState {
    const run = this.#requireState().run;
    if (!run) throw new ConflictError('No controller run exists');
    return run;
  }

  async #saveState(): Promise<void> {
    const state = this.#requireState();
    if (state.run) state.run.updatedAt = this.#nowIso();
    await this.#store.save(state);
  }

  #nowIso(): string {
    return this.#now().toISOString();
  }
}

const assetCount = (statistics: ServerStatistics): number => statistics.photos + statistics.videos;

async function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
