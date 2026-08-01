import { describe, expect, it } from 'vitest';
import { CpuMonitor } from '../src/monitoring/cpu.js';

describe('CpuMonitor lifecycle', () => {
  it('does no sampling until requested and clears samples when stopped', () => {
    const monitor = new CpuMonitor(60_000, 60_000);
    expect(monitor.status()).toMatchObject({ monitoring: false, available: false });

    monitor.start();
    expect(monitor.isRunning()).toBe(true);
    monitor.sample();
    expect(monitor.status().monitoring).toBe(true);

    monitor.stop();
    expect(monitor.status()).toMatchObject({ monitoring: false, available: false, averagePercent: null });
  });
});
