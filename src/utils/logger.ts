export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  sequence: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface LogSnapshot {
  level: LogLevel;
  capacity: number;
  dropped: number;
  entries: LogEntry[];
}

export interface AppLogger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  configure(level: LogLevel, capacity: number): void;
  snapshot(minimumLevel?: LogLevel, limit?: number): LogSnapshot;
  clear(): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { trace: 0, debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /api[-_]?key|authorization|cookie|password|secret|token/i;

export class JsonLogger implements AppLogger {
  #level: LogLevel;
  #capacity: number;
  #sequence = 0;
  #dropped = 0;
  #entries: LogEntry[] = [];

  constructor(level: LogLevel = 'info', capacity = 1_000) {
    this.#level = level;
    this.#capacity = normalizeCapacity(capacity);
  }

  configure(level: LogLevel, capacity: number): void {
    this.#level = level;
    this.#capacity = normalizeCapacity(capacity);
    this.#trim();
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.#write('trace', message, context);
  }

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

  snapshot(minimumLevel: LogLevel = 'trace', limit = this.#capacity): LogSnapshot {
    const normalizedLimit = Math.max(1, Math.min(Math.trunc(limit), this.#capacity));
    const entries = this.#entries
      .filter((entry) => LEVEL_ORDER[entry.level] >= LEVEL_ORDER[minimumLevel])
      .slice(-normalizedLimit)
      .map((entry) => structuredClone(entry));
    return { level: this.#level, capacity: this.#capacity, dropped: this.#dropped, entries };
  }

  clear(): void {
    this.#entries = [];
    this.#dropped = 0;
  }

  #write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.#level]) return;
    const safeContext = context ? sanitizeRecord(context) : undefined;
    const entry: LogEntry = {
      sequence: ++this.#sequence,
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(safeContext && Object.keys(safeContext).length > 0 ? { context: safeContext } : {}),
    };
    this.#entries.push(entry);
    this.#trim();

    const line = JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      sequence: entry.sequence,
      ...entry.context,
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  #trim(): void {
    const excess = this.#entries.length - this.#capacity;
    if (excess <= 0) return;
    this.#entries.splice(0, excess);
    this.#dropped += excess;
  }
}

function normalizeCapacity(value: number): number {
  return Math.max(100, Math.min(20_000, Math.trunc(value)));
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(value, new WeakSet<object>()) as Record<string, unknown>;
}

function sanitizeValue(value: unknown, seen: WeakSet<object>, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return {
      name: value.name,
      message: value.message,
      ...(value.cause === undefined ? {} : { cause: sanitizeValue(value.cause, seen, 'cause') }),
    };
  }
  if (typeof value === 'undefined') return '[undefined]';
  if (typeof value === 'symbol') return value.description ? `[Symbol ${value.description}]` : '[Symbol]';
  if (typeof value === 'function') return value.name ? `[Function ${value.name}]` : '[Function]';
  if (typeof value !== 'object') return '[Unsupported value]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, seen, childKey)]),
  );
}
