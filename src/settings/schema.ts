import { z } from 'zod';
import type { AppConfig } from '../config/schema.js';
import { QueueNameSchema, type QueueName } from '../domain/queues.js';

export const QueuePolicySchema = z.enum(['managed', 'always-running', 'ignored']);
export type QueuePolicy = z.infer<typeof QueuePolicySchema>;

export const DEFAULT_TRANSIENT_COUNTER_QUEUES: readonly QueueName[] = [
  'sidecar',
  'metadataExtraction',
  'duplicateDetection',
  'facialRecognition',
];

export const QueueRuntimeSettingSchema = z
  .object({
    queue: QueueNameSchema,
    policy: QueuePolicySchema,
    checkMissing: z.boolean(),
    stabilizeTransientCount: z.boolean().optional(),
  })
  .transform((setting) => ({
    ...setting,
    stabilizeTransientCount:
      setting.stabilizeTransientCount ?? DEFAULT_TRANSIENT_COUNTER_QUEUES.includes(setting.queue),
  }));
export type QueueRuntimeSetting = z.infer<typeof QueueRuntimeSettingSchema>;

export const RuntimeSettingsSchema = z
  .object({
    version: z.literal(1),
    automation: z.object({
      scanOnAutopilotStart: z.boolean(),
      scanOnManualStart: z.boolean(),
      processingPriority: z.enum(['configured-order', 'smallest-first']).default('configured-order'),
      uploadQuietPeriodMs: z.number().int().min(0).max(24 * 60 * 60_000),
      adaptiveQuietEnabled: z.boolean(),
      adaptiveQuietPerAssetMs: z.number().int().min(0).max(60_000),
      adaptiveQuietMaxMs: z.number().int().min(0).max(7 * 24 * 60 * 60_000),
      periodicDiscoveryIntervalMs: z.number().int().min(60 * 60_000).max(30 * 24 * 60 * 60_000).nullable(),
      discoverySettleMs: z.number().int().min(1).max(5 * 60_000),
      discoveryTimeoutMs: z.number().int().min(10_000).max(60 * 60_000),
      inventoryHoldMs: z.number().int().min(0).max(60_000),
      transientCounterStabilizationEnabled: z.boolean().default(true),
      transientCounterWindowMs: z.number().int().min(5_000).max(5 * 60_000).default(15_000),
      transientCounterMaxMs: z.number().int().min(5_000).max(30 * 60_000).default(2 * 60_000),
      transientCounterMinimumDropPercent: z.number().min(1).max(100).default(20),
      activePollMs: z.number().int().min(1).max(60_000),
      guardedPollMs: z.number().int().min(1).max(29_999),
      standbyPollMs: z.number().int().min(1).max(60 * 60_000),
      queueQuietMs: z.number().int().min(1).max(5 * 60_000),
    }),
    loadGuard: z.object({
      mode: z.enum(['off', 'observe', 'throttle']),
      monitorInIdle: z.boolean().default(false),
      sampleIntervalMs: z.number().int().min(1_000).max(60_000),
      movingAverageWindowMs: z.number().int().min(5_000).max(30 * 60_000),
      pauseAbove: z.number().min(1).max(100).nullable(),
      pauseForMs: z.number().int().min(1_000).max(60 * 60_000),
      resumeBelow: z.number().min(0).max(99).nullable(),
      resumeForMs: z.number().int().min(1_000).max(60 * 60_000),
    }),
    logging: z
      .object({
        level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
        retainedEntries: z.number().int().min(100).max(20_000).default(1_000),
      })
      .default({ level: 'info', retainedEntries: 1_000 }),
    queues: z.array(QueueRuntimeSettingSchema).min(1),
  })
  .superRefine((settings, context) => {
    const names = new Set<QueueName>();
    for (const [index, queue] of settings.queues.entries()) {
      if (names.has(queue.queue)) {
        context.addIssue({ code: 'custom', path: ['queues', index, 'queue'], message: `Duplicate queue: ${queue.queue}` });
      }
      names.add(queue.queue);
    }
    if (settings.automation.discoveryTimeoutMs < settings.automation.discoverySettleMs) {
      context.addIssue({
        code: 'custom',
        path: ['automation', 'discoveryTimeoutMs'],
        message: 'Discovery timeout must be greater than or equal to the settle period',
      });
    }
    if (settings.automation.transientCounterMaxMs < settings.automation.transientCounterWindowMs) {
      context.addIssue({
        code: 'custom',
        path: ['automation', 'transientCounterMaxMs'],
        message: 'Transient counter maximum must be greater than or equal to its observation window',
      });
    }
    if (settings.automation.adaptiveQuietMaxMs < settings.automation.uploadQuietPeriodMs) {
      context.addIssue({
        code: 'custom',
        path: ['automation', 'adaptiveQuietMaxMs'],
        message: 'Adaptive maximum must be greater than or equal to the base upload quiet period',
      });
    }
    if (settings.loadGuard.movingAverageWindowMs < settings.loadGuard.sampleIntervalMs) {
      context.addIssue({
        code: 'custom',
        path: ['loadGuard', 'movingAverageWindowMs'],
        message: 'CPU averaging window must be greater than or equal to the sample interval',
      });
    }
    if (settings.loadGuard.mode === 'throttle') {
      if (settings.loadGuard.pauseAbove === null || settings.loadGuard.resumeBelow === null) {
        context.addIssue({ code: 'custom', path: ['loadGuard'], message: 'CPU throttle thresholds are required' });
      } else if (settings.loadGuard.resumeBelow >= settings.loadGuard.pauseAbove) {
        context.addIssue({
          code: 'custom',
          path: ['loadGuard', 'resumeBelow'],
          message: 'CPU resume threshold must be lower than the pause threshold',
        });
      }
    }
  });

export type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>;

export function parseRuntimeSettings(input: unknown): RuntimeSettings {
  return RuntimeSettingsSchema.parse(input);
}

export function defaultRuntimeSettings(config: AppConfig): RuntimeSettings {
  return parseRuntimeSettings({
    version: 1,
    automation: {
      scanOnAutopilotStart: true,
      scanOnManualStart: true,
      processingPriority: 'configured-order',
      uploadQuietPeriodMs: config.autopilot.autoEndAfterMs,
      adaptiveQuietEnabled: false,
      adaptiveQuietPerAssetMs: 2_000,
      adaptiveQuietMaxMs: Math.max(config.autopilot.autoEndAfterMs, 60 * 60_000),
      periodicDiscoveryIntervalMs: null,
      discoverySettleMs: config.scheduler.startSettlePeriodMs,
      discoveryTimeoutMs: 10 * 60_000,
      inventoryHoldMs: 5_000,
      transientCounterStabilizationEnabled: true,
      transientCounterWindowMs: 15_000,
      transientCounterMaxMs: 2 * 60_000,
      transientCounterMinimumDropPercent: 20,
      activePollMs: config.scheduler.pollIntervalMs,
      guardedPollMs: config.scheduler.guardedIdlePollIntervalMs,
      standbyPollMs: config.scheduler.standbyPollIntervalMs,
      queueQuietMs: config.scheduler.quietPeriodMs,
    },
    loadGuard: {
      mode: config.loadGuard.mode,
      monitorInIdle: false,
      sampleIntervalMs: config.loadGuard.sampleIntervalMs,
      movingAverageWindowMs: config.loadGuard.movingAverageWindowMs,
      pauseAbove: config.loadGuard.pauseAbove,
      pauseForMs: config.loadGuard.pauseForMs,
      resumeBelow: config.loadGuard.resumeBelow,
      resumeForMs: config.loadGuard.resumeForMs,
    },
    logging: {
      level: 'info',
      retainedEntries: 1_000,
    },
    queues: config.pipeline.map((stage) => ({
      queue: stage.queue,
      policy: config.scheduler.managedQueues.includes(stage.queue) ? 'managed' : 'ignored',
      checkMissing: stage.startMissing,
      stabilizeTransientCount: DEFAULT_TRANSIENT_COUNTER_QUEUES.includes(stage.queue),
    })),
  });
}
