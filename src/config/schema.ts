import { z } from 'zod';
import { DEFAULT_PIPELINE, defaultManagedQueues, validatePipeline, type PipelineStage } from '../domain/pipeline.js';
import { QueueNameSchema, type QueueName } from '../domain/queues.js';
import { parseDuration } from './duration.js';

const DurationSchema = z
  .union([z.string(), z.number().int().nonnegative()])
  .transform((value, context) => {
    try {
      return typeof value === 'number' ? value : parseDuration(value);
    } catch (error) {
      context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) });
      return z.NEVER;
    }
  });

const OptionalPercentSchema = z.number().min(0).max(100).nullable().default(null);
const HttpUrlSchema = z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
  message: 'Only http:// and https:// URLs are supported',
});

const PipelineStageSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  queue: QueueNameSchema,
  dependsOn: z.array(z.string()).default([]),
  startMissing: z.boolean().default(false),
  resourceGroup: z.enum(['cpu-io', 'io', 'ml-vision', 'ml-text', 'video']),
  feature: z.enum(['smartSearch', 'duplicateDetection', 'facialRecognition', 'ocr']).optional(),
  cooldownAfter: DurationSchema.optional(),
});

const RawConfigSchema = z.object({
  version: z.literal(1).default(1),
  mode: z.enum(['observe', 'manual-session', 'capture-assisted', 'autopilot', 'scheduled']).default('observe'),
  dryRun: z.boolean().default(true),
  control: z
    .object({
      enabled: z.boolean().default(false),
      resumePersistedRun: z.boolean().default(true),
      newInstallAction: z.literal('wait').default('wait'),
    })
    .prefault({}),
  api: z
    .object({
      url: HttpUrlSchema.default('http://immich-server:2283/api'),
      timeout: DurationSchema.default(10_000),
      allowLegacyStart: z.boolean().default(true),
      strictMajorVersion: z.boolean().default(true),
      supportedMajorVersions: z.array(z.number().int().positive()).default([3]),
    })
    .prefault({}),
  server: z
    .object({
      host: z.string().default('127.0.0.1'),
      port: z.number().int().min(1).max(65535).default(8005),
      trustProxy: z.boolean().default(false),
      authentication: z.enum(['auto', 'password', 'none']).default('auto'),
    })
    .prefault({}),
  scheduler: z
    .object({
      managedQueues: z.array(QueueNameSchema).default(defaultManagedQueues()),
      pollInterval: DurationSchema.default(5_000),
      guardedIdlePollInterval: DurationSchema.default(10_000),
      standbyPollInterval: DurationSchema.default(30_000),
      startSettlePeriod: DurationSchema.default(10_000),
      quietPeriod: DurationSchema.default(30_000),
      revisitPolicy: z.literal('finish-pass').default('finish-pass'),
    })
    .prefault({}),
  capture: z
    .object({
      uploadQuietPeriod: DurationSchema.default(60_000),
      processingPolicy: z.literal('drain-first-repair-second').default('drain-first-repair-second'),
    })
    .prefault({}),
  autopilot: z
    .object({
      available: z.boolean().default(true),
      autoEndAfter: DurationSchema.default(1_800_000),
      minimumCaptureTime: DurationSchema.default(60_000),
      newUploadDuringProcessing: z.literal('pause-after-active-and-recapture').default('pause-after-active-and-recapture'),
    })
    .prefault({}),
  loadGuard: z
    .object({
      mode: z.enum(['off', 'observe', 'throttle']).default('observe'),
      source: z.literal('local-host').default('local-host'),
      sampleInterval: DurationSchema.default(2_000),
      movingAverageWindow: DurationSchema.default(30_000),
      pauseAbove: OptionalPercentSchema,
      pauseFor: DurationSchema.default(30_000),
      resumeBelow: OptionalPercentSchema,
      resumeFor: DurationSchema.default(60_000),
    })
    .prefault({}),
  recovery: z
    .object({
      startupPolicy: z.literal('reconcile').default('reconcile'),
      idlePolicy: z.literal('restore-original').default('restore-original'),
      manualOverridePolicy: z.literal('stop-controller').default('stop-controller'),
      ambiguousStartPolicy: z.literal('require-operator').default('require-operator'),
    })
    .prefault({}),
  pipeline: z.array(PipelineStageSchema).prefault(
    DEFAULT_PIPELINE.map((stage) => ({
      ...stage,
      ...(stage.cooldownAfterMs === undefined ? {} : { cooldownAfter: stage.cooldownAfterMs }),
    })),
  ),
});

export interface AppConfig {
  version: 1;
  mode: 'observe' | 'manual-session' | 'capture-assisted' | 'autopilot' | 'scheduled';
  dryRun: boolean;
  control: { enabled: boolean; resumePersistedRun: boolean; newInstallAction: 'wait' };
  api: {
    url: string;
    timeoutMs: number;
    allowLegacyStart: boolean;
    strictMajorVersion: boolean;
    supportedMajorVersions: number[];
  };
  server: { host: string; port: number; trustProxy: boolean; authentication: 'auto' | 'password' | 'none' };
  scheduler: {
    managedQueues: QueueName[];
    pollIntervalMs: number;
    guardedIdlePollIntervalMs: number;
    standbyPollIntervalMs: number;
    startSettlePeriodMs: number;
    quietPeriodMs: number;
    revisitPolicy: 'finish-pass';
  };
  capture: { uploadQuietPeriodMs: number; processingPolicy: 'drain-first-repair-second' };
  autopilot: {
    available: boolean;
    autoEndAfterMs: number;
    minimumCaptureTimeMs: number;
    newUploadDuringProcessing: 'pause-after-active-and-recapture';
  };
  loadGuard: {
    mode: 'off' | 'observe' | 'throttle';
    source: 'local-host';
    sampleIntervalMs: number;
    movingAverageWindowMs: number;
    pauseAbove: number | null;
    pauseForMs: number;
    resumeBelow: number | null;
    resumeForMs: number;
  };
  recovery: {
    startupPolicy: 'reconcile';
    idlePolicy: 'restore-original';
    manualOverridePolicy: 'stop-controller';
    ambiguousStartPolicy: 'require-operator';
  };
  pipeline: PipelineStage[];
}

export function parseConfig(input: unknown): AppConfig {
  const raw = RawConfigSchema.parse(input);
  const pipeline: PipelineStage[] = raw.pipeline.map((stage) => ({
    id: stage.id,
    queue: stage.queue,
    dependsOn: stage.dependsOn,
    startMissing: stage.startMissing,
    resourceGroup: stage.resourceGroup,
    ...(stage.feature === undefined ? {} : { feature: stage.feature }),
    ...(stage.cooldownAfter === undefined ? {} : { cooldownAfterMs: stage.cooldownAfter }),
  }));

  validatePipeline(pipeline, raw.scheduler.managedQueues);
  if (raw.scheduler.pollInterval <= 0 || raw.scheduler.guardedIdlePollInterval <= 0 || raw.scheduler.standbyPollInterval <= 0) {
    throw new Error('Scheduler poll intervals must be greater than zero');
  }
  if (raw.scheduler.guardedIdlePollInterval >= 30_000) {
    throw new Error('scheduler.guardedIdlePollInterval must stay below 30 seconds');
  }
  if (raw.loadGuard.mode === 'throttle') {
    if (raw.loadGuard.pauseAbove === null || raw.loadGuard.resumeBelow === null) {
      throw new Error('loadGuard throttle requires pauseAbove and resumeBelow');
    }
    if (raw.loadGuard.resumeBelow >= raw.loadGuard.pauseAbove) {
      throw new Error('loadGuard.resumeBelow must be lower than pauseAbove');
    }
  }

  return {
    version: raw.version,
    mode: raw.mode,
    dryRun: raw.dryRun,
    control: raw.control,
    api: {
      url: raw.api.url,
      timeoutMs: raw.api.timeout,
      allowLegacyStart: raw.api.allowLegacyStart,
      strictMajorVersion: raw.api.strictMajorVersion,
      supportedMajorVersions: raw.api.supportedMajorVersions,
    },
    server: raw.server,
    scheduler: {
      managedQueues: raw.scheduler.managedQueues,
      pollIntervalMs: raw.scheduler.pollInterval,
      guardedIdlePollIntervalMs: raw.scheduler.guardedIdlePollInterval,
      standbyPollIntervalMs: raw.scheduler.standbyPollInterval,
      startSettlePeriodMs: raw.scheduler.startSettlePeriod,
      quietPeriodMs: raw.scheduler.quietPeriod,
      revisitPolicy: raw.scheduler.revisitPolicy,
    },
    capture: {
      uploadQuietPeriodMs: raw.capture.uploadQuietPeriod,
      processingPolicy: raw.capture.processingPolicy,
    },
    autopilot: {
      available: raw.autopilot.available,
      autoEndAfterMs: raw.autopilot.autoEndAfter,
      minimumCaptureTimeMs: raw.autopilot.minimumCaptureTime,
      newUploadDuringProcessing: raw.autopilot.newUploadDuringProcessing,
    },
    loadGuard: {
      mode: raw.loadGuard.mode,
      source: raw.loadGuard.source,
      sampleIntervalMs: raw.loadGuard.sampleInterval,
      movingAverageWindowMs: raw.loadGuard.movingAverageWindow,
      pauseAbove: raw.loadGuard.pauseAbove,
      pauseForMs: raw.loadGuard.pauseFor,
      resumeBelow: raw.loadGuard.resumeBelow,
      resumeForMs: raw.loadGuard.resumeFor,
    },
    recovery: raw.recovery,
    pipeline,
  };
}
