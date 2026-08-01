import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseRuntimeSettings, type RuntimeSettings } from './schema.js';

export class SettingsStore {
  readonly #path: string;
  #serialized: string | null = null;

  constructor(dataDirectory: string) {
    this.#path = join(dataDirectory, 'settings.json');
  }

  async initialize(defaults: RuntimeSettings): Promise<RuntimeSettings> {
    await mkdir(dirname(this.#path), { recursive: true });
    try {
      const settings = await this.load();
      this.#serialized = serialize(settings);
      return settings;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      await this.save(defaults);
      return defaults;
    }
  }

  async load(): Promise<RuntimeSettings> {
    const content = await readFile(this.#path, 'utf8');
    try {
      return parseRuntimeSettings(JSON.parse(content) as unknown);
    } catch (error) {
      throw new Error(`Settings file failed validation: ${this.#path}`, { cause: error });
    }
  }

  async save(settings: RuntimeSettings): Promise<boolean> {
    const validated = parseRuntimeSettings(settings);
    const serialized = serialize(validated);
    if (serialized === this.#serialized) return false;
    const temporaryPath = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, this.#path);
    await syncDirectory(dirname(this.#path));
    this.#serialized = serialized;
    return true;
  }
}

function serialize(settings: RuntimeSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
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
