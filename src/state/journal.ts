import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { QueueNameSchema, type QueueName } from '../domain/queues.js';

const JournalEventSchema = z.object({
  schemaVersion: z.literal(1),
  actionId: z.string().uuid(),
  runId: z.string().uuid(),
  timestamp: z.string(),
  event: z.enum(['PREPARED', 'VERIFIED', 'COMMITTED', 'FAILED', 'AMBIGUOUS']),
  action: z.enum(['pause', 'resume', 'start-missing']),
  queue: QueueNameSchema,
  beforePaused: z.boolean().nullable(),
  desiredPaused: z.boolean().nullable(),
  reason: z.string(),
  error: z.string().nullable(),
});
export type JournalEvent = z.infer<typeof JournalEventSchema>;

export interface PreparedAction {
  actionId: string;
  runId: string;
  action: 'pause' | 'resume' | 'start-missing';
  queue: QueueName;
  beforePaused: boolean | null;
  desiredPaused: boolean | null;
  reason: string;
  preparedAt: string;
}

export class ActionJournal {
  readonly #path: string;

  constructor(dataDirectory: string) {
    this.#path = join(dataDirectory, 'journal.jsonl');
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const handle = await open(this.#path, 'a', 0o600);
    await handle.close();
  }

  async prepare(
    input: Omit<PreparedAction, 'actionId' | 'preparedAt'>,
    now = new Date(),
  ): Promise<PreparedAction> {
    const prepared = { ...input, actionId: randomUUID(), preparedAt: now.toISOString() };
    await this.append({
      schemaVersion: 1,
      actionId: prepared.actionId,
      runId: prepared.runId,
      action: prepared.action,
      queue: prepared.queue,
      beforePaused: prepared.beforePaused,
      desiredPaused: prepared.desiredPaused,
      reason: prepared.reason,
      timestamp: prepared.preparedAt,
      event: 'PREPARED',
      error: null,
    });
    return prepared;
  }

  appendTransition(
    prepared: PreparedAction,
    event: 'VERIFIED' | 'COMMITTED' | 'FAILED' | 'AMBIGUOUS',
    error: string | null = null,
    now = new Date(),
  ): Promise<void> {
    return this.append({
      schemaVersion: 1,
      ...prepared,
      timestamp: now.toISOString(),
      event,
      error,
    });
  }

  async append(event: JournalEvent): Promise<void> {
    const validated = JournalEventSchema.parse(event);
    const handle = await open(this.#path, 'a', 0o600);
    try {
      await handle.write(`${JSON.stringify(validated)}\n`, undefined, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async readAll(): Promise<JournalEvent[]> {
    let content: string;
    try {
      content = await readFile(this.#path, 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JournalEventSchema.parse(JSON.parse(line) as unknown);
        } catch (error) {
          throw new Error(`Invalid journal entry at line ${index + 1}`, { cause: error });
        }
      });
  }

  async openActions(runId?: string): Promise<PreparedAction[]> {
    const events = await this.readAll();
    const byAction = new Map<string, JournalEvent[]>();
    for (const event of events) {
      if (runId && event.runId !== runId) continue;
      const current = byAction.get(event.actionId) ?? [];
      current.push(event);
      byAction.set(event.actionId, current);
    }
    const result: PreparedAction[] = [];
    for (const history of byAction.values()) {
      const prepared = history[0];
      const last = history.at(-1);
      if (!prepared || !last || prepared.event !== 'PREPARED') continue;
      if (last.event === 'COMMITTED' || last.event === 'FAILED' || last.event === 'AMBIGUOUS') continue;
      result.push({
        actionId: prepared.actionId,
        runId: prepared.runId,
        action: prepared.action,
        queue: prepared.queue,
        beforePaused: prepared.beforePaused,
        desiredPaused: prepared.desiredPaused,
        reason: prepared.reason,
        preparedAt: prepared.timestamp,
      });
    }
    return result;
  }

  async latestCommittedPauseStates(runId: string): Promise<Partial<Record<QueueName, boolean>>> {
    const events = await this.readAll();
    const preparedById = new Map<string, JournalEvent>();
    const result: Partial<Record<QueueName, boolean>> = {};
    for (const event of events) {
      if (event.runId !== runId) continue;
      if (event.event === 'PREPARED') preparedById.set(event.actionId, event);
      if (event.event !== 'COMMITTED') continue;
      const prepared = preparedById.get(event.actionId);
      if (!prepared || prepared.desiredPaused === null) continue;
      result[prepared.queue] = prepared.desiredPaused;
    }
    return result;
  }

  async latestAmbiguousAction(runId: string): Promise<PreparedAction | null> {
    const events = await this.readAll();
    const preparedById = new Map<string, JournalEvent>();
    let result: PreparedAction | null = null;
    for (const event of events) {
      if (event.runId !== runId) continue;
      if (event.event === 'PREPARED') preparedById.set(event.actionId, event);
      if (event.event !== 'AMBIGUOUS') continue;
      const prepared = preparedById.get(event.actionId);
      if (!prepared) continue;
      result = toPreparedAction(prepared);
    }
    return result;
  }

  async committedStartQueues(runId: string): Promise<QueueName[]> {
    const events = await this.readAll();
    const preparedById = new Map<string, JournalEvent>();
    const queues = new Set<QueueName>();
    for (const event of events) {
      if (event.runId !== runId) continue;
      if (event.event === 'PREPARED') preparedById.set(event.actionId, event);
      if (event.event !== 'COMMITTED') continue;
      const prepared = preparedById.get(event.actionId);
      if (prepared?.action === 'start-missing') queues.add(prepared.queue);
    }
    return [...queues];
  }
}

function toPreparedAction(event: JournalEvent): PreparedAction {
  return {
    actionId: event.actionId,
    runId: event.runId,
    action: event.action,
    queue: event.queue,
    beforePaused: event.beforePaused,
    desiredPaused: event.desiredPaused,
    reason: event.reason,
    preparedAt: event.timestamp,
  };
}
