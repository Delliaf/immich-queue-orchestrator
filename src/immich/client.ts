import { z } from 'zod';
import { QueueNameSchema, type QueueName, type QueueSnapshot } from '../domain/queues.js';
import type { AppLogger } from '../utils/logger.js';
import {
  QueueJobListSchema,
  LegacyQueueResponseSchema,
  QueueWireListSchema,
  QueueSnapshotSchema,
  ServerFeaturesSchema,
  ServerStatisticsSchema,
  ServerVersionSchema,
  type QueueJob,
  type ServerFeatures,
  type ServerStatistics,
  type ServerVersion,
} from './schemas.js';

export type QueueJobStatus = 'active' | 'failed' | 'completed' | 'delayed' | 'waiting' | 'paused';

export interface ImmichApi {
  getVersion(signal?: AbortSignal): Promise<ServerVersion>;
  getFeatures(signal?: AbortSignal): Promise<ServerFeatures>;
  getServerStatistics(signal?: AbortSignal): Promise<ServerStatistics>;
  getQueues(signal?: AbortSignal): Promise<QueueSnapshot[]>;
  getQueue(name: QueueName, signal?: AbortSignal): Promise<QueueSnapshot>;
  setQueuePaused(name: QueueName, isPaused: boolean, signal?: AbortSignal): Promise<QueueSnapshot>;
  getQueueJobs(name: QueueName, statuses: readonly QueueJobStatus[], signal?: AbortSignal): Promise<QueueJob[]>;
  startMissing(name: QueueName, signal?: AbortSignal): Promise<void>;
  unknownQueueNames(): readonly string[];
}

export class ImmichApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ImmichApiError';
  }
}

export interface ImmichClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
  logger?: AppLogger;
}

export class ImmichClient implements ImmichApi {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #logger: AppLogger | undefined;
  #unknownQueueNames: string[] = [];

  constructor(options: ImmichClientOptions) {
    this.#baseUrl = normalizeApiUrl(options.baseUrl);
    this.#apiKey = options.apiKey;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#logger = options.logger;
  }

  getVersion(signal?: AbortSignal): Promise<ServerVersion> {
    return this.#request('/server/version', ServerVersionSchema, signalInit(signal));
  }

  getFeatures(signal?: AbortSignal): Promise<ServerFeatures> {
    return this.#request('/server/features', ServerFeaturesSchema, signalInit(signal));
  }

  getServerStatistics(signal?: AbortSignal): Promise<ServerStatistics> {
    return this.#request('/server/statistics', ServerStatisticsSchema, signalInit(signal));
  }

  async getQueues(signal?: AbortSignal): Promise<QueueSnapshot[]> {
    const queues = await this.#request('/queues', QueueWireListSchema, signalInit(signal));
    const known: QueueSnapshot[] = [];
    const unknown: string[] = [];
    for (const queue of queues) {
      const name = QueueNameSchema.safeParse(queue.name);
      if (!name.success) {
        unknown.push(queue.name);
        continue;
      }
      known.push({ ...queue, name: name.data });
    }
    this.#unknownQueueNames = unknown;
    return known;
  }

  getQueue(name: QueueName, signal?: AbortSignal): Promise<QueueSnapshot> {
    return this.#request(`/queues/${encodeURIComponent(name)}`, QueueSnapshotSchema, signalInit(signal));
  }

  setQueuePaused(name: QueueName, isPaused: boolean, signal?: AbortSignal): Promise<QueueSnapshot> {
    return this.#request(`/queues/${encodeURIComponent(name)}`, QueueSnapshotSchema, {
      method: 'PUT',
      body: JSON.stringify({ isPaused }),
      ...signalInit(signal),
    });
  }

  getQueueJobs(name: QueueName, statuses: readonly QueueJobStatus[], signal?: AbortSignal): Promise<QueueJob[]> {
    const query = new URLSearchParams();
    for (const status of statuses) query.append('status', status);
    return this.#request(
      `/queues/${encodeURIComponent(name)}/jobs?${query.toString()}`,
      QueueJobListSchema,
      signalInit(signal),
    );
  }

  async startMissing(name: QueueName, signal?: AbortSignal): Promise<void> {
    await this.#request(`/jobs/${encodeURIComponent(name)}`, LegacyQueueResponseSchema, {
      method: 'PUT',
      body: JSON.stringify({ command: 'start', force: false }),
      ...signalInit(signal),
    });
  }

  unknownQueueNames(): readonly string[] {
    return this.#unknownQueueNames;
  }

  async #request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const method = init.method ?? 'GET';
    const startedAt = Date.now();
    this.#logger?.trace('Immich API request started', { method, path });
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': this.#apiKey,
          ...init.headers,
        },
      });
    } catch (error) {
      this.#logger?.debug('Immich API request failed before a response', {
        method,
        path,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw new ImmichApiError(`Immich request failed: ${method} ${path}`, undefined, undefined, {
        cause: error,
      });
    }

    const text = await response.text();
    if (!response.ok) {
      this.#logger?.debug('Immich API request rejected', {
        method,
        path,
        status: response.status,
        durationMs: Date.now() - startedAt,
        responseBody: text.slice(0, 1000),
      });
      throw new ImmichApiError(
        `Immich returned HTTP ${response.status}: ${method} ${path}`,
        response.status,
        text.slice(0, 1000),
      );
    }

    this.#logger?.trace('Immich API request completed', {
      method,
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      responseBytes: text.length,
    });

    const raw: unknown = text.length === 0 ? undefined : safeJson(text, path);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ImmichApiError(`Invalid Immich response for ${path}: ${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  }
}

function safeJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ImmichApiError(`Immich returned invalid JSON for ${path}`, undefined, text.slice(0, 1000), { cause: error });
  }
}

export function normalizeApiUrl(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/$/, '');
  if (!url.pathname.endsWith('/api')) url.pathname = `${url.pathname}/api`.replace('//api', '/api');
  return url.toString().replace(/\/$/, '');
}

function signalInit(signal: AbortSignal | undefined): RequestInit {
  return signal ? { signal } : {};
}
