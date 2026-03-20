import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

interface ExecuteBody {
  plan: unknown;
  dryRun?: boolean;
}

export async function executeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ExecuteBody }>('/execute', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as ExecuteBody;

    if (!body.plan || !(body.plan as any).actions) {
      return reply.status(400).send({ error: 'Missing required field: plan' });
    }

    const result = await fm.execute(body.plan as any, { dryRun: body.dryRun });
    return { data: result };
  });
}
