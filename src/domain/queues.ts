import { z } from 'zod';

export const QUEUE_NAMES = [
  'thumbnailGeneration',
  'metadataExtraction',
  'videoConversion',
  'faceDetection',
  'facialRecognition',
  'smartSearch',
  'duplicateDetection',
  'backgroundTask',
  'storageTemplateMigration',
  'migration',
  'search',
  'sidecar',
  'library',
  'notifications',
  'backupDatabase',
  'ocr',
  'workflow',
  'integrityCheck',
  'editor',
] as const;

export const QueueNameSchema = z.enum(QUEUE_NAMES);
export type QueueName = z.infer<typeof QueueNameSchema>;

export const FORBIDDEN_MANAGED_QUEUES = new Set<QueueName>([
  'backgroundTask',
  'migration',
  'search',
  'notifications',
  'backupDatabase',
  'workflow',
  'integrityCheck',
  'editor',
]);

export const DEFAULT_MANAGED_QUEUES = [
  'thumbnailGeneration',
  'metadataExtraction',
  'sidecar',
  'smartSearch',
  'duplicateDetection',
  'faceDetection',
  'facialRecognition',
  'ocr',
  'videoConversion',
] as const satisfies readonly QueueName[];

export const QUEUE_ALL_JOB_NAMES: Partial<Record<QueueName, string>> = {
  metadataExtraction: 'AssetExtractMetadataQueueAll',
  thumbnailGeneration: 'AssetGenerateThumbnailsQueueAll',
  smartSearch: 'SmartSearchQueueAll',
  duplicateDetection: 'AssetDetectDuplicatesQueueAll',
  faceDetection: 'AssetDetectFacesQueueAll',
  facialRecognition: 'FacialRecognitionQueueAll',
  ocr: 'OcrQueueAll',
  videoConversion: 'AssetEncodeVideoQueueAll',
  storageTemplateMigration: 'StorageTemplateMigration',
  sidecar: 'SidecarQueueAll',
  library: 'LibraryScanQueueAll',
};

export interface QueueStatistics {
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  waiting: number;
  paused: number;
}

export interface QueueSnapshot {
  name: QueueName;
  isPaused: boolean;
  statistics: QueueStatistics;
}

export const pendingJobs = (queue: QueueSnapshot): number =>
  queue.statistics.active + queue.statistics.waiting + queue.statistics.paused + queue.statistics.delayed;

export const queueIsQuietCandidate = (queue: QueueSnapshot): boolean => pendingJobs(queue) === 0;
