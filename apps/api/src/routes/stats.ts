import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stats', async () => {
    const fm = (app as any).fm as FileMom;
    const stats = await fm.getStats();
    return { data: stats };
  });
}
