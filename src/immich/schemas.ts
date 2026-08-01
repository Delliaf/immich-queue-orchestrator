import { z } from 'zod';
import { QueueNameSchema } from '../domain/queues.js';

export const ServerVersionSchema = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
});
export type ServerVersion = z.infer<typeof ServerVersionSchema>;

export const ServerFeaturesSchema = z
  .object({
    smartSearch: z.boolean(),
    duplicateDetection: z.boolean(),
    facialRecognition: z.boolean(),
    ocr: z.boolean(),
  })
  .passthrough();
export type ServerFeatures = z.infer<typeof ServerFeaturesSchema>;

export const ServerStatisticsSchema = z.object({
  photos: z.number().int().nonnegative(),
  videos: z.number().int().nonnegative(),
  usage: z.number().int().nonnegative(),
});
export type ServerStatistics = z.infer<typeof ServerStatisticsSchema>;

export const QueueStatisticsSchema = z.object({
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  paused: z.number().int().nonnegative(),
});

export const QueueSnapshotSchema = z.object({
  name: QueueNameSchema,
  isPaused: z.boolean(),
  statistics: QueueStatisticsSchema,
});

export const QueueWireListSchema = z.array(
  z.object({
    name: z.string(),
    isPaused: z.boolean(),
    statistics: QueueStatisticsSchema,
  }),
);

export const QueueJobSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.number().int(),
});
export const QueueJobListSchema = z.array(QueueJobSchema);
export type QueueJob = z.infer<typeof QueueJobSchema>;

export const LegacyQueueResponseSchema = z.object({
  queueStatus: z.object({
    isActive: z.boolean(),
    isPaused: z.boolean(),
  }),
  jobCounts: QueueStatisticsSchema,
});
