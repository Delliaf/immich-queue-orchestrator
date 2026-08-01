import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parsePersistentState, type PersistentState } from './model.js';

export class StateStore {
  readonly #path: string;

  constructor(dataDirectory: string) {
    this.#path = join(dataDirectory, 'state.json');
  }

  async initialize(now = new Date()): Promise<PersistentState> {
    await mkdir(dirname(this.#path), { recursive: true });
    try {
      return await this.load();
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      const created: PersistentState = {
        schemaVersion: 1,
        controllerInstanceId: randomUUID(),
        initializedAt: now.toISOString(),
        autopilotArmed: false,
        pausedByOperator: false,
        run: null,
        lastCompletedRun: null,
      };
      await this.save(created);
      return created;
    }
  }

  async load(): Promise<PersistentState> {
    const content = await readFile(this.#path, 'utf8');
    let raw: unknown;
    try {
      raw = JSON.parse(content) as unknown;
    } catch (error) {
      throw new Error(`State file is not valid JSON: ${this.#path}`, { cause: error });
    }
    try {
      return parsePersistentState(raw);
    } catch (error) {
      throw new Error(`State file failed schema validation: ${this.#path}`, { cause: error });
    }
  }

  async save(state: PersistentState): Promise<void> {
    const validated = parsePersistentState(state);
    const temporaryPath = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, this.#path);
    await syncDirectory(dirname(this.#path));
  }
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const directory = await open(path, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
