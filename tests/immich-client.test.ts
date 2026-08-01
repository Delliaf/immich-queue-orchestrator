import { describe, expect, it, vi } from 'vitest';
import { ImmichApiError, ImmichClient, normalizeApiUrl } from '../src/immich/client.js';

describe('ImmichClient', () => {
  it('normalizes base URLs to the API root', () => {
    expect(normalizeApiUrl('http://immich:2283')).toBe('http://immich:2283/api');
    expect(normalizeApiUrl('http://immich:2283/api/')).toBe('http://immich:2283/api');
  });

  it('sends the API key and validates a queue response', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'metadataExtraction',
          isPaused: true,
          statistics: { active: 0, completed: 1, failed: 0, delayed: 0, waiting: 2, paused: 0 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new ImmichClient({ baseUrl: 'http://immich:2283', apiKey: 'secret', timeoutMs: 1_000, fetchImplementation: mockFetch });
    const queue = await client.getQueue('metadataExtraction');
    expect(queue.statistics.waiting).toBe(2);
    const call = mockFetch.mock.calls[0];
    expect(call?.[0]).toBe('http://immich:2283/api/queues/metadataExtraction');
    expect(new Headers(call?.[1]?.headers).get('x-api-key')).toBe('secret');
  });

  it('ignores and reports queue names introduced by a newer Immich', async () => {
    const body = [
      {
        name: 'metadataExtraction',
        isPaused: true,
        statistics: { active: 0, completed: 0, failed: 0, delayed: 0, waiting: 0, paused: 0 },
      },
      {
        name: 'futureQueue',
        isPaused: false,
        statistics: { active: 0, completed: 0, failed: 0, delayed: 0, waiting: 0, paused: 0 },
      },
    ];
    const client = new ImmichClient({
      baseUrl: 'http://immich:2283/api',
      apiKey: 'secret',
      timeoutMs: 1_000,
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
    });
    expect(await client.getQueues()).toHaveLength(1);
    expect(client.unknownQueueNames()).toEqual(['futureQueue']);
  });

  it('fails closed on a malformed API response', async () => {
    const client = new ImmichClient({
      baseUrl: 'http://immich:2283/api',
      apiKey: 'secret',
      timeoutMs: 1_000,
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ major: 'three' }), { status: 200 })),
    });
    await expect(client.getVersion()).rejects.toBeInstanceOf(ImmichApiError);
  });

  it('accepts the legacy queue response returned by start missing', async () => {
    const body = {
      queueStatus: { isActive: false, isPaused: true },
      jobCounts: { active: 0, completed: 0, failed: 0, delayed: 0, waiting: 1, paused: 0 },
    };
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const client = new ImmichClient({
      baseUrl: 'http://immich:2283/api',
      apiKey: 'secret',
      timeoutMs: 1_000,
      fetchImplementation: mockFetch,
    });
    await expect(client.startMissing('metadataExtraction')).resolves.toBeUndefined();
    expect(mockFetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ command: 'start', force: false }));
  });
});
