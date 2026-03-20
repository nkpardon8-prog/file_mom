import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

export async function smartFolderRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { folderName?: string; description?: string; messages?: unknown[] } }>(
    '/smart-folder/ask',
    async (request, reply) => {
      const fm = (app as any).fm as FileMom;
      const { folderName, description, messages } = (request.body ?? {}) as any;
      if (!folderName?.trim() || !description?.trim()) {
        return reply.status(400).send({ error: 'Missing required fields: folderName, description' });
      }
      const result = await fm.smartFolderAsk(folderName.trim(), description.trim(), messages ?? []);
      const cost = fm.getAICost();
      return { data: { ...result, cost } };
    },
  );

  app.post<{ Body: { criteria?: unknown } }>('/smart-folder/preview', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const { criteria } = (request.body ?? {}) as any;
    if (!criteria) {
      return reply.status(400).send({ error: 'Missing required field: criteria' });
    }
    const results = await fm.smartFolderPreview(criteria);
    return { data: results };
  });

  app.post<{ Body: { folderPath?: string; filePaths?: string[] } }>('/smart-folder/create', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const { folderPath, filePaths } = (request.body ?? {}) as any;
    if (!folderPath?.trim() || !Array.isArray(filePaths) || filePaths.length === 0) {
      return reply.status(400).send({ error: 'Missing required fields: folderPath, filePaths' });
    }
    const result = await fm.smartFolderCreate(folderPath.trim(), filePaths);
    return { data: result };
  });
}
