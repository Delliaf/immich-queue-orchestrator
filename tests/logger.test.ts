import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonLogger } from '../src/utils/logger.js';

afterEach(() => vi.restoreAllMocks());

describe('JsonLogger', () => {
  it('redacts secrets and filters entries by the configured level', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new JsonLogger('info', 100);
    logger.debug('hidden');
    logger.info('visible', { apiKey: 'secret', nested: { password: 'secret', value: 42 } });

    const snapshot = logger.snapshot('trace');
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.context).toEqual({
      apiKey: '[REDACTED]',
      nested: { password: '[REDACTED]', value: 42 },
    });
  });

  it('keeps a bounded in-memory ring and reports overwritten entries', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new JsonLogger('trace', 100);
    for (let index = 0; index < 105; index += 1) logger.trace('poll', { index });

    const snapshot = logger.snapshot('trace', 100);
    expect(snapshot.entries).toHaveLength(100);
    expect(snapshot.entries[0]?.context).toEqual({ index: 5 });
    expect(snapshot.dropped).toBe(5);
  });
});
