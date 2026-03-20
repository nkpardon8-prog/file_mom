import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

interface UndoBody {
  batchId: string;
}

export async function undoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/undo/batches', async () => {
    const fm = (app as any).fm as FileMom;
    const batches = await fm.getUndoableBatches();
    return { data: batches };
  });

  app.post<{ Body: UndoBody }>('/undo', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as UndoBody;

    if (!body.batchId) {
      return reply.status(400).send({ error: 'Missing required field: batchId' });
    }

    const result = await fm.undo(body.batchId);
    return { data: result };
  });
}
