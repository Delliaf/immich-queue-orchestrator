import type { ServerFeatures } from '../immich/schemas.js';
import {
  DEFAULT_MANAGED_QUEUES,
  FORBIDDEN_MANAGED_QUEUES,
  type QueueName,
} from './queues.js';

export type FeatureName = 'smartSearch' | 'duplicateDetection' | 'facialRecognition' | 'ocr';

export interface PipelineStage {
  id: string;
  queue: QueueName;
  dependsOn: string[];
  startMissing: boolean;
  resourceGroup: 'cpu-io' | 'io' | 'ml-vision' | 'ml-text' | 'video';
  feature?: FeatureName;
  cooldownAfterMs?: number;
}

export const DEFAULT_PIPELINE: readonly PipelineStage[] = [
  {
    id: 'thumbnails',
    queue: 'thumbnailGeneration',
    dependsOn: [],
    startMissing: true,
    resourceGroup: 'cpu-io',
  },
  {
    id: 'metadata',
    queue: 'metadataExtraction',
    dependsOn: [],
    startMissing: true,
    resourceGroup: 'cpu-io',
  },
  {
    id: 'sidecar',
    queue: 'sidecar',
    dependsOn: [],
    startMissing: true,
    resourceGroup: 'io',
  },
  {
    id: 'smart-search',
    queue: 'smartSearch',
    dependsOn: ['metadata', 'thumbnails'],
    startMissing: true,
    resourceGroup: 'ml-text',
    feature: 'smartSearch',
  },
  {
    id: 'duplicates',
    queue: 'duplicateDetection',
    dependsOn: ['smart-search'],
    startMissing: true,
    resourceGroup: 'ml-text',
    feature: 'duplicateDetection',
  },
  {
    id: 'face-detection',
    queue: 'faceDetection',
    dependsOn: ['thumbnails'],
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
  {
    id: 'ocr',
    queue: 'ocr',
    dependsOn: ['thumbnails'],
    startMissing: true,
    resourceGroup: 'ml-text',
    feature: 'ocr',
  },
  {
    id: 'video',
    queue: 'videoConversion',
    dependsOn: ['metadata', 'thumbnails'],
    startMissing: true,
    resourceGroup: 'video',
  },
];

export function validatePipeline(stages: readonly PipelineStage[], managedQueues: readonly QueueName[]): void {
  const managed = new Set(managedQueues);
  const ids = new Set<string>();
  const queues = new Set<QueueName>();

  if (managed.size !== managedQueues.length) throw new Error('managedQueues contains duplicates');

  for (const queue of managed) {
    if (FORBIDDEN_MANAGED_QUEUES.has(queue)) {
      throw new Error(`Queue ${queue} is forbidden in managedQueues`);
    }
  }

  for (const stage of stages) {
    if (ids.has(stage.id)) {
      throw new Error(`Duplicate pipeline stage id: ${stage.id}`);
    }
    ids.add(stage.id);
    if (queues.has(stage.queue)) throw new Error(`Queue ${stage.queue} is used by more than one pipeline stage`);
    queues.add(stage.queue);
    if (!managed.has(stage.queue)) {
      throw new Error(`Pipeline queue ${stage.queue} is not managed`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(stages.map((stage) => [stage.id, stage]));

  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new Error(`Pipeline dependency cycle detected at ${id}`);
    }
    if (visited.has(id)) return;
    const stage = byId.get(id);
    if (!stage) throw new Error(`Missing pipeline dependency: ${id}`);
    visiting.add(id);
    for (const dependency of stage.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };

  for (const stage of stages) visit(stage.id);

  const stageIndex = new Map(stages.map((stage, index) => [stage.id, index]));
  for (const [index, stage] of stages.entries()) {
    for (const dependency of stage.dependsOn) {
      const dependencyIndex = stageIndex.get(dependency);
      if (dependencyIndex !== undefined && dependencyIndex >= index) {
        throw new Error(`Pipeline stage ${stage.id} appears before its dependency ${dependency}`);
      }
    }
  }
}

export function enabledPipeline(stages: readonly PipelineStage[], features: ServerFeatures): PipelineStage[] {
  let enabled = stages.filter((stage) => stage.feature === undefined || features[stage.feature]);
  let changed = true;
  while (changed) {
    const ids = new Set(enabled.map((stage) => stage.id));
    const filtered = enabled.filter((stage) => stage.dependsOn.every((dependency) => ids.has(dependency)));
    changed = filtered.length !== enabled.length;
    enabled = filtered;
  }
  return enabled;
}

export const defaultManagedQueues = (): QueueName[] => [...DEFAULT_MANAGED_QUEUES];
