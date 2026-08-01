import { z } from 'zod';
import type { PipelineStage } from '../domain/pipeline.js';
import { QueueNameSchema, type QueueName } from '../domain/queues.js';

export const ControllerPhaseSchema = z.enum([
  'IDLE',
  'PREPARING',
  'DISCOVERING',
  'INVENTORY_READY',
  'GUARDED_IDLE',
  'CAPTURING_UPLOADS',
  'PROCESSING',
  'RUNNING_STAGE',
  'WAITING_FOR_QUIET',
  'PAUSED_BY_OPERATOR',
  'AMBIGUOUS_START',
  'DEGRADED',
  'RELEASING',
  'COMPLETED',
]);
export type ControllerPhase = z.infer<typeof ControllerPhaseSchema>;

export const RunModeSchema = z.enum(['manual-session', 'capture-assisted', 'autopilot']);
export type RunMode = z.infer<typeof RunModeSchema>;

export const StageStatusSchema = z.enum(['pending', 'draining', 'repair-settling', 'repairing', 'completed']);
export type StageStatus = z.infer<typeof StageStatusSchema>;
export const DiscoveryStatusSchema = z.enum(['pending', 'running', 'stabilizing', 'complete', 'skipped']);
export type DiscoveryStatus = z.infer<typeof DiscoveryStatusSchema>;

const ActivitySnapshotSchema = z.object({
  assets: z.number().int().nonnegative(),
  usage: z.number().int().nonnegative(),
  pendingTotal: z.number().int().nonnegative(),
  capturedAt: z.string(),
});
export type ActivitySnapshot = z.infer<typeof ActivitySnapshotSchema>;

const StageRuntimeSchema = z.object({
  id: z.string(),
  queue: QueueNameSchema,
  status: StageStatusSchema,
  repairAttempted: z.boolean(),
  quietSince: z.string().nullable(),
  settleUntil: z.string().nullable(),
  completedAt: z.string().nullable(),
  discoveryStatus: DiscoveryStatusSchema.default('pending'),
  inventoryCount: z.number().int().nonnegative().default(0),
  inventoryInitialCount: z.number().int().nonnegative().default(0),
  inventoryStabilized: z.boolean().default(false),
  stabilizationStartedAt: z.string().nullable().default(null),
  stabilizationSampleAt: z.string().nullable().default(null),
  stabilizationSampleCount: z.number().int().nonnegative().nullable().default(null),
  discoveryStartedAt: z.string().nullable().default(null),
  discoveryRetryAt: z.string().nullable().default(null),
  discoveryCompletedAt: z.string().nullable().default(null),
  discoveryJobSeen: z.boolean().default(false),
  discoveryTimedOut: z.boolean().default(false),
  discoveryNeedsRescan: z.boolean().default(false),
});
export interface StageRuntime {
  id: string;
  queue: QueueName;
  status: StageStatus;
  repairAttempted: boolean;
  quietSince: string | null;
  settleUntil: string | null;
  completedAt: string | null;
  discoveryStatus: DiscoveryStatus;
  inventoryCount: number;
  inventoryInitialCount: number;
  inventoryStabilized: boolean;
  stabilizationStartedAt: string | null;
  stabilizationSampleAt: string | null;
  stabilizationSampleCount: number | null;
  discoveryStartedAt: string | null;
  discoveryRetryAt: string | null;
  discoveryCompletedAt: string | null;
  discoveryJobSeen: boolean;
  discoveryTimedOut: boolean;
  discoveryNeedsRescan: boolean;
}

const RunStateSchema = z.object({
  id: z.string().uuid(),
  mode: RunModeSchema,
  phase: ControllerPhaseSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  originalQueueStates: z.record(z.string(), z.boolean()),
  desiredQueueStates: z.record(z.string(), z.boolean()),
  stages: z.array(StageRuntimeSchema),
  currentStageIndex: z.number().int().nonnegative(),
  discoveryStageIndex: z.number().int().nonnegative().default(0),
  inventoryReadyUntil: z.string().nullable().default(null),
  captureStartedAt: z.string().nullable(),
  captureStartAssets: z.number().int().nonnegative().default(0),
  captureEndRequested: z.boolean(),
  lastActivityAt: z.string().nullable(),
  lastActivity: ActivitySnapshotSchema.nullable(),
  lastObservedAssets: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  loadThrottled: z.boolean(),
  loadHighSince: z.string().nullable(),
  loadLowSince: z.string().nullable(),
});

export interface RunState {
  id: string;
  mode: RunMode;
  phase: ControllerPhase;
  createdAt: string;
  updatedAt: string;
  originalQueueStates: Partial<Record<QueueName, boolean>>;
  desiredQueueStates: Partial<Record<QueueName, boolean>>;
  stages: StageRuntime[];
  currentStageIndex: number;
  discoveryStageIndex: number;
  inventoryReadyUntil: string | null;
  captureStartedAt: string | null;
  captureStartAssets: number;
  captureEndRequested: boolean;
  lastActivityAt: string | null;
  lastActivity: ActivitySnapshot | null;
  lastObservedAssets: number;
  lastError: string | null;
  loadThrottled: boolean;
  loadHighSince: string | null;
  loadLowSince: string | null;
}

const CompletedRunSchema = z.object({
  id: z.string().uuid(),
  mode: RunModeSchema,
  completedAt: z.string(),
});

export const PersistentStateSchema = z.object({
  schemaVersion: z.literal(1),
  controllerInstanceId: z.string().uuid(),
  initializedAt: z.string(),
  autopilotArmed: z.boolean(),
  pausedByOperator: z.boolean(),
  run: RunStateSchema.nullable(),
  lastCompletedRun: CompletedRunSchema.nullable(),
  lastDiscoveryAt: z.string().nullable().default(null),
});

export interface PersistentState {
  schemaVersion: 1;
  controllerInstanceId: string;
  initializedAt: string;
  autopilotArmed: boolean;
  pausedByOperator: boolean;
  run: RunState | null;
  lastCompletedRun: { id: string; mode: RunMode; completedAt: string } | null;
  lastDiscoveryAt: string | null;
}

export const createStageRuntime = (stage: PipelineStage): StageRuntime => ({
  id: stage.id,
  queue: stage.queue,
  status: 'pending',
  repairAttempted: false,
  quietSince: null,
  settleUntil: null,
  completedAt: null,
  discoveryStatus: 'pending',
  inventoryCount: 0,
  inventoryInitialCount: 0,
  inventoryStabilized: false,
  stabilizationStartedAt: null,
  stabilizationSampleAt: null,
  stabilizationSampleCount: null,
  discoveryStartedAt: null,
  discoveryRetryAt: null,
  discoveryCompletedAt: null,
  discoveryJobSeen: false,
  discoveryTimedOut: false,
  discoveryNeedsRescan: false,
});

export const resetStages = (stages: StageRuntime[]): StageRuntime[] =>
  stages.map((stage) => ({
    ...stage,
    status: 'pending',
    repairAttempted: false,
    quietSince: null,
    settleUntil: null,
    completedAt: null,
    discoveryStatus: 'pending',
    inventoryCount: 0,
    inventoryInitialCount: 0,
    inventoryStabilized: false,
    stabilizationStartedAt: null,
    stabilizationSampleAt: null,
    stabilizationSampleCount: null,
    discoveryStartedAt: null,
    discoveryRetryAt: null,
    discoveryCompletedAt: null,
    discoveryJobSeen: false,
    discoveryTimedOut: false,
    discoveryNeedsRescan: false,
  }));

export function parsePersistentState(input: unknown): PersistentState {
  return PersistentStateSchema.parse(input);
}
