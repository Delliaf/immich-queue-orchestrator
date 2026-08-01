import { afterEach, describe, expect, it, vi } from 'vitest';
import { Script } from 'node:vm';
import { parseConfig } from '../src/config/schema.js';
import type { QueueOrchestrator } from '../src/controller/orchestrator.js';
import { createWebServer } from '../src/web/server.js';
import { UI_HTML } from '../src/web/ui.js';

const servers: Array<ReturnType<typeof createWebServer>> = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => server.close())));

describe('web server security', () => {
  it('ships syntactically valid embedded browser code', () => {
    const script = /<script>([\s\S]+)<\/script>/.exec(UI_HTML)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Script(script!)).not.toThrow();
  });

  it('does not expose status without the panel password', async () => {
    const server = createServer();
    const response = await server.inject({ method: 'GET', url: '/api/status' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: 'Unauthorized: valid panel password required' });
  });

  it('accepts authenticated status and serial actions', async () => {
    const processBacklog = vi.fn().mockResolvedValue(undefined);
    const server = createServer({ processBacklog });
    const status = await server.inject({
      method: 'GET',
      url: '/api/status',
      headers: { authorization: 'Bearer test-password' },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ ready: true });

    const action = await server.inject({
      method: 'POST',
      url: '/api/actions/process',
      headers: { authorization: 'Bearer test-password' },
      payload: {},
    });
    expect(action.statusCode).toBe(202);
    expect(processBacklog).toHaveBeenCalledOnce();
  });

  it('rate-limits repeated wrong panel passwords', async () => {
    const server = createServer();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await server.inject({
        method: 'GET',
        url: '/api/status',
        headers: { authorization: 'Bearer wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await server.inject({
      method: 'GET',
      url: '/api/status',
      headers: { authorization: 'Bearer test-password' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeTruthy();
  });

  it('allows requests when trusted-network mode is explicitly active', async () => {
    const server = createServer({ isAuthorized: () => true });
    const response = await server.inject({ method: 'GET', url: '/api/status' });
    expect(response.statusCode).toBe(200);
  });

});

function createServer(overrides: Record<string, unknown> = {}): ReturnType<typeof createWebServer> {
  const config = parseConfig({ server: { host: '127.0.0.1', port: 8080 } });
  const orchestrator = {
    effectiveConfig: () => config,
    isAuthorized: (password: string | undefined) => password === 'test-password',
    status: () => ({ ready: true, apiConnected: true }),
    processBacklog: () => Promise.resolve(),
    captureBegin: () => Promise.resolve(),
    captureEnd: () => Promise.resolve(),
    armAutopilot: () => Promise.resolve(),
    pauseController: () => Promise.resolve(),
    resumeController: () => Promise.resolve(),
    release: () => Promise.resolve(),
    resolveAmbiguous: () => Promise.resolve(),
    ...overrides,
  } as unknown as QueueOrchestrator;
  const server = createWebServer(orchestrator);
  servers.push(server);
  return server;
}
