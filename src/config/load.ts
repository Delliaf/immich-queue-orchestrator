import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { parseConfig, type AppConfig } from './schema.js';

export interface RuntimeSecrets {
  immichApiKey: string;
  adminPassword: string | null;
}

export async function loadConfig(path: string, environment: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  const content = await readFile(path, 'utf8');
  const input = parseYaml(content) as unknown;
  const merged = applyEnvironment(input, environment);
  return parseConfig(merged);
}

export async function loadSecrets(environment: NodeJS.ProcessEnv = process.env): Promise<RuntimeSecrets> {
  const immichApiKey = await valueOrFile(environment.IMMICH_API_KEY ?? environment.API_KEY, environment.IMMICH_API_KEY_FILE);
  if (!immichApiKey) throw new Error('Set IMMICH_API_KEY_FILE (recommended), IMMICH_API_KEY, or API_KEY');
  const adminPassword = await valueOrFile(
    environment.ORCHESTRATOR_ADMIN_PASSWORD,
    environment.ORCHESTRATOR_ADMIN_PASSWORD_FILE,
  );
  return { immichApiKey, adminPassword: adminPassword || null };
}

async function valueOrFile(value: string | undefined, path: string | undefined): Promise<string> {
  if (path) return (await readFile(path, 'utf8')).trim();
  return value?.trim() ?? '';
}

function applyEnvironment(input: unknown, environment: NodeJS.ProcessEnv): unknown {
  const source = isRecord(input) ? structuredClone(input) : {};
  const api = isRecord(source.api) ? source.api : {};
  const server = isRecord(source.server) ? source.server : {};
  const scheduler = isRecord(source.scheduler) ? source.scheduler : {};
  const autopilot = isRecord(source.autopilot) ? source.autopilot : {};
  if (environment.IMMICH_URL) api.url = normalizeImmichUrl(environment.IMMICH_URL);
  if (environment.ALLOW_LEGACY_START) api.allowLegacyStart = parseBoolean(environment.ALLOW_LEGACY_START);
  if (environment.POLL_INTERVAL) scheduler.pollInterval = durationEnvironmentValue(environment.POLL_INTERVAL);
  if (environment.GUARDED_IDLE_POLL_INTERVAL) {
    scheduler.guardedIdlePollInterval = durationEnvironmentValue(environment.GUARDED_IDLE_POLL_INTERVAL);
  }
  if (environment.STANDBY_POLL_INTERVAL) {
    scheduler.standbyPollInterval = durationEnvironmentValue(environment.STANDBY_POLL_INTERVAL);
  }
  if (environment.UPLOAD_QUIET_PERIOD) autopilot.autoEndAfter = durationEnvironmentValue(environment.UPLOAD_QUIET_PERIOD);
  if (environment.ORCHESTRATOR_HOST) server.host = environment.ORCHESTRATOR_HOST;
  if (environment.ORCHESTRATOR_PORT) server.port = Number(environment.ORCHESTRATOR_PORT);
  source.api = api;
  source.server = server;
  source.scheduler = scheduler;
  source.autopilot = autopilot;
  return source;
}

function normalizeImmichUrl(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/api') ? path : `${path}/api`;
  return url.toString().replace(/\/$/, '');
}

function durationEnvironmentValue(value: string): string {
  return /^\d+(?:\.\d+)?$/.test(value.trim()) ? `${value.trim()}s` : value.trim();
}

function parseBoolean(value: string): boolean {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`Expected a boolean environment value, received: ${value}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
