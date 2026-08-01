import { cpus } from 'node:os';

interface CpuTimes {
  idle: number;
  total: number;
}

export interface CpuStatus {
  monitoring: boolean;
  available: boolean;
  currentPercent: number | null;
  averagePercent: number | null;
  peakPercent: number | null;
  sampledAt: string | null;
}

export class CpuMonitor {
  #sampleIntervalMs: number;
  #windowMs: number;
  readonly #now: () => Date;
  #previous: CpuTimes | null = null;
  #samples: Array<{ timestamp: number; value: number }> = [];
  #peak: number | null = null;
  #timer: NodeJS.Timeout | null = null;

  constructor(sampleIntervalMs: number, windowMs: number, now: () => Date = () => new Date()) {
    this.#sampleIntervalMs = sampleIntervalMs;
    this.#windowMs = windowMs;
    this.#now = now;
  }

  start(): void {
    if (this.#timer) return;
    this.sample();
    this.#timer = setInterval(() => this.sample(), this.#sampleIntervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.#previous = null;
    this.#samples = [];
    this.#peak = null;
  }

  isRunning(): boolean {
    return this.#timer !== null;
  }

  configure(sampleIntervalMs: number, windowMs: number): void {
    if (sampleIntervalMs === this.#sampleIntervalMs && windowMs === this.#windowMs) return;
    const restart = this.isRunning();
    this.stop();
    this.#sampleIntervalMs = sampleIntervalMs;
    this.#windowMs = windowMs;
    if (restart) this.start();
  }

  sample(): number | null {
    const current = readCpuTimes();
    const previous = this.#previous;
    this.#previous = current;
    if (!previous) return null;
    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;
    if (totalDelta <= 0) return null;
    const value = clamp(100 * (1 - idleDelta / totalDelta));
    const timestamp = this.#now().getTime();
    this.#samples.push({ timestamp, value });
    this.#samples = this.#samples.filter((sample) => timestamp - sample.timestamp <= this.#windowMs);
    this.#peak = this.#peak === null ? value : Math.max(this.#peak, value);
    return value;
  }

  status(): CpuStatus {
    const latest = this.#samples.at(-1);
    const average =
      this.#samples.length === 0
        ? null
        : this.#samples.reduce((sum, sample) => sum + sample.value, 0) / this.#samples.length;
    return {
      monitoring: this.isRunning(),
      available: latest !== undefined,
      currentPercent: latest?.value ?? null,
      averagePercent: average,
      peakPercent: this.#peak,
      sampledAt: latest ? new Date(latest.timestamp).toISOString() : null,
    };
  }
}

function readCpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.idle + cpu.times.irq + cpu.times.nice + cpu.times.sys + cpu.times.user;
  }
  return { idle, total };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}
