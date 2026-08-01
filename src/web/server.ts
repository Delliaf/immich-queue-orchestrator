import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { QueueOrchestrator } from '../controller/orchestrator.js';
import { ConflictError, ControlDisabledError, errorMessage } from '../utils/errors.js';
import { UI_HTML } from './ui.js';

export function createWebServer(orchestrator: QueueOrchestrator): FastifyInstance {
  const config = orchestrator.effectiveConfig();
  const app = Fastify({ logger: false, trustProxy: config.server.trustProxy, bodyLimit: 32 * 1024 });
  const failedAuthentication = new Map<string, { failures: number; blockedUntil: number }>();

  app.addHook('onSend', async (_request, reply, payload) => {
    void reply
      .header('x-content-type-options', 'nosniff')
      .header('x-frame-options', 'DENY')
      .header('referrer-policy', 'no-referrer')
      .header('content-security-policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
      .header('cache-control', 'no-store');
    return payload;
  });

  app.get('/', (_request, reply) => reply.type('text/html; charset=utf-8').send(UI_HTML));
  app.get('/healthz', () => ({ status: 'ok' }));
  app.get('/readyz', (_request, reply) => {
    const status = orchestrator.status();
    if (!status.ready || !status.apiConnected) void reply.code(503);
    return { ready: status.ready && status.apiConnected, fatalError: status.fatalError, apiConnected: status.apiConnected };
  });

  app.get('/api/status', { preHandler: authorize }, () => orchestrator.status());
  app.get('/api/config/effective', { preHandler: authorize }, () => orchestrator.effectiveConfig());

  action('/api/actions/process', () => orchestrator.processBacklog());
  action('/api/actions/capture-begin', () => orchestrator.captureBegin());
  action('/api/actions/capture-end', () => orchestrator.captureEnd());
  action('/api/actions/arm-autopilot', () => orchestrator.armAutopilot());
  action('/api/actions/pause', () => orchestrator.pauseController());
  action('/api/actions/resume', () => orchestrator.resumeController());
  action('/api/actions/release', () => orchestrator.release());

  app.post('/api/actions/resolve-ambiguous', { preHandler: authorize }, async (request, reply) => {
    const parsed = z.object({ decision: z.enum(['assume-sent', 'retry-start', 'abort']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: z.prettifyError(parsed.error) });
    return handleAction(reply, () => orchestrator.resolveAmbiguous(parsed.data.decision));
  });

  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ message: 'Not found' }));
  return app;

  async function authorize(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const now = Date.now();
    const previous = failedAuthentication.get(request.ip);
    if (previous?.blockedUntil && previous.blockedUntil > now) {
      const retryAfter = Math.ceil((previous.blockedUntil - now) / 1_000);
      await reply.header('retry-after', String(retryAfter)).code(429).send({ message: 'Too many password attempts; try later' });
      return;
    }
    if (previous?.blockedUntil && previous.blockedUntil <= now) failedAuthentication.delete(request.ip);

    const authorization = request.headers.authorization;
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    const candidate = bearer ?? headerValue(request.headers['x-orchestrator-password']);
    if (!orchestrator.isAuthorized(candidate)) {
      if (candidate) {
        const failures = (failedAuthentication.get(request.ip)?.failures ?? 0) + 1;
        failedAuthentication.set(request.ip, {
          failures,
          blockedUntil: failures >= 5 ? now + 5 * 60_000 : 0,
        });
      }
      await reply.code(401).send({ message: 'Unauthorized: valid panel password required' });
      return;
    }
    failedAuthentication.delete(request.ip);
  }

  function action(path: string, operation: () => Promise<void>): void {
    app.post(path, { preHandler: authorize }, async (_request, reply) => handleAction(reply, operation));
  }
}

async function handleAction(reply: FastifyReply, operation: () => Promise<void>): Promise<unknown> {
  try {
    await operation();
    return reply.code(202).send({ accepted: true });
  } catch (error) {
    if (error instanceof ConflictError) return reply.code(409).send({ message: error.message });
    if (error instanceof ControlDisabledError) return reply.code(403).send({ message: error.message });
    return reply.code(500).send({ message: errorMessage(error) });
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
