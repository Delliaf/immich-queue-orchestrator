import { resolve } from 'node:path';
import { loadConfig, loadSecrets } from './config/load.js';
import { QueueOrchestrator } from './controller/orchestrator.js';
import { ImmichClient } from './immich/client.js';
import { CpuMonitor } from './monitoring/cpu.js';
import { defaultRuntimeSettings } from './settings/schema.js';
import { SettingsStore } from './settings/store.js';
import { ActionJournal } from './state/journal.js';
import { StateStore } from './state/store.js';
import { JsonLogger } from './utils/logger.js';
import { createWebServer } from './web/server.js';

async function main(): Promise<void> {
  const configPath = resolve(process.env.CONFIG_FILE ?? './orchestrator.yml');
  const dataDirectory = resolve(process.env.DATA_DIR ?? './data');
  const config = await loadConfig(configPath);
  const secrets = await loadSecrets();
  const logger = new JsonLogger(logLevel(process.env.LOG_LEVEL));
  const settingsStore = new SettingsStore(dataDirectory);
  const settings = await settingsStore.initialize(defaultRuntimeSettings(config));

  const orchestrator = new QueueOrchestrator({
    config,
    api: new ImmichClient({
      baseUrl: config.api.url,
      apiKey: secrets.immichApiKey,
      timeoutMs: config.api.timeoutMs,
    }),
    stateStore: new StateStore(dataDirectory),
    journal: new ActionJournal(dataDirectory),
    cpuMonitor: new CpuMonitor(settings.loadGuard.sampleIntervalMs, settings.loadGuard.movingAverageWindowMs),
    logger,
    adminPassword: secrets.adminPassword,
    settings,
    settingsStore,
  });

  if (orchestrator.status().control.authentication === 'none') {
    logger.warn('Panel password is not configured; keep access inside a trusted network');
  }

  await orchestrator.initialize();
  orchestrator.start();
  const web = createWebServer(orchestrator);
  await web.listen({ host: config.server.host, port: config.server.port });
  logger.info('Immich Queue Orchestrator started', {
    host: config.server.host,
    port: config.server.port,
    mode: config.mode,
    dryRun: config.dryRun,
    authentication: config.server.authentication,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Graceful shutdown requested', { signal });
    await web.close();
    await orchestrator.stop();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

function logLevel(value: string | undefined): 'debug' | 'info' | 'warn' | 'error' {
  return ['debug', 'info', 'warn', 'error'].includes(value ?? '')
    ? (value as 'debug' | 'info' | 'warn' | 'error')
    : 'info';
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
