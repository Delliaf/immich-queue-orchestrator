import type { AppLogger } from '../controller/orchestrator.js';

export class JsonLogger implements AppLogger {
  constructor(private readonly level: 'debug' | 'info' | 'warn' | 'error' = 'info') {}

  debug(message: string, context?: Record<string, unknown>): void {
    this.#write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.#write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.#write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.#write('error', message, context);
  }

  #write(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    const order = { debug: 10, info: 20, warn: 30, error: 40 };
    if (order[level] < order[this.level]) return;
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...context });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}
