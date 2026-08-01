import { createServer } from 'node:http';

const names = [
  'thumbnailGeneration', 'metadataExtraction', 'videoConversion', 'faceDetection', 'facialRecognition',
  'smartSearch', 'duplicateDetection', 'backgroundTask', 'storageTemplateMigration', 'migration', 'search',
  'sidecar', 'library', 'notifications', 'backupDatabase', 'ocr', 'workflow', 'integrityCheck', 'editor',
];

const queues = new Map(names.map((name, index) => [name, {
  name,
  isPaused: name !== 'backgroundTask',
  statistics: {
    active: 0,
    completed: index * 13,
    failed: index % 5 === 0 ? 1 : 0,
    delayed: 0,
    waiting: ['metadataExtraction', 'thumbnailGeneration'].includes(name) ? 200 : 0,
    paused: 0,
  },
}]));

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const send = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  };
  if (request.method === 'GET' && url.pathname === '/api/server/version') return send(200, { major: 3, minor: 1, patch: 0 });
  if (request.method === 'GET' && url.pathname === '/api/server/features') {
    return send(200, { smartSearch: true, duplicateDetection: true, facialRecognition: true, ocr: true });
  }
  if (request.method === 'GET' && url.pathname === '/api/server/statistics') {
    return send(200, { photos: 18743, videos: 932, usage: 483183820800 });
  }
  if (request.method === 'GET' && url.pathname === '/api/queues') return send(200, [...queues.values()]);
  const queueMatch = /^\/api\/queues\/([^/]+)$/.exec(url.pathname);
  if (queueMatch) {
    const queue = queues.get(decodeURIComponent(queueMatch[1] ?? ''));
    if (!queue) return send(404, { message: 'Queue not found' });
    if (request.method === 'GET') return send(200, queue);
    if (request.method === 'PUT') {
      const body = JSON.parse(await readBody(request));
      queue.isPaused = Boolean(body.isPaused);
      return send(200, queue);
    }
  }
  if (request.method === 'GET' && /^\/api\/queues\/[^/]+\/jobs$/.test(url.pathname)) return send(200, []);
  const jobMatch = /^\/api\/jobs\/([^/]+)$/.exec(url.pathname);
  if (request.method === 'PUT' && jobMatch) {
    const queue = queues.get(decodeURIComponent(jobMatch[1] ?? ''));
    if (!queue) return send(404, { message: 'Queue not found' });
    return send(200, { queueStatus: { isActive: false, isPaused: queue.isPaused }, jobCounts: queue.statistics });
  }
  return send(404, { message: 'Not found' });
});

server.listen(32283, '127.0.0.1', () => console.log('Mock Immich listening on http://127.0.0.1:32283'));

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
