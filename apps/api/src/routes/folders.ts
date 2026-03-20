import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

export async function folderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/folders', async () => {
    const fm = (app as any).fm as FileMom;
    const folders = await fm.getFolders();
    return { data: folders };
  });
}
