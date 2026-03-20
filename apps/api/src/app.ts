import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { FileMom, FileMomError } from '@filemom/engine';
import { healthRoutes } from './routes/health.js';
import { statsRoutes } from './routes/stats.js';
import { scanRoutes } from './routes/scan.js';
import { searchRoutes } from './routes/search.js';
import { filesRoutes } from './routes/files.js';
import { settingsRoutes } from './routes/settings.js';
import { planRoutes } from './routes/plan.js';
import { executeRoutes } from './routes/execute.js';
import { undoRoutes } from './routes/undo.js';
import { enrichRoutes } from './routes/enrich.js';
import { describeRoutes } from './routes/describe.js';
import { folderRoutes } from './routes/folders.js';
import { smartFolderRoutes } from './routes/smart-folder.js';
import { watchRestRoutes, watchWsRoutes } from './routes/watch.js';

export async function buildApp(fm: FileMom, opts?: { logger?: boolean }) {
  const app = Fastify({
    logger: opts?.logger ?? true,
    requestTimeout: 300000, // 5 minutes for long scans
  });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  // Make FileMom available to all routes
  app.decorate('fm', fm);

  // Register routes
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(statsRoutes, { prefix: '/api' });
  await app.register(scanRoutes, { prefix: '/api' });
  await app.register(searchRoutes, { prefix: '/api' });
  await app.register(filesRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(planRoutes, { prefix: '/api' });
  await app.register(executeRoutes, { prefix: '/api' });
  await app.register(undoRoutes, { prefix: '/api' });
  await app.register(enrichRoutes, { prefix: '/api' });
  await app.register(describeRoutes, { prefix: '/api' });
  await app.register(folderRoutes, { prefix: '/api' });
  await app.register(smartFolderRoutes, { prefix: '/api' });
  await app.register(watchRestRoutes, { prefix: '/api' });
  await app.register(watchWsRoutes);

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    const fmError = error as unknown as FileMomError;
    if (fmError.code && typeof fmError.recoverable === 'boolean') {
      reply.status(fmError.recoverable ? 400 : 500).send({
        error: fmError.message,
        code: fmError.code,
      });
    } else {
      app.log.error(error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  return app;
}
