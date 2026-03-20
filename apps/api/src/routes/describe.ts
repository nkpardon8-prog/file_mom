import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

interface DescribeBatchBody {
  limit?: number;
}

interface DescribeFileBody {
  path: string;
}

export async function describeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/describe/status', async () => {
    const fm = (app as any).fm as FileMom;
    const flags = fm.getFeatureFlags();
    const undescribedCount = flags.enableAIDescriptions
      ? await fm.getUndescribedCount()
      : 0;
    return {
      data: {
        undescribedCount,
        enableAIDescriptions: flags.enableAIDescriptions,
      },
    };
  });

  app.post<{ Body: DescribeBatchBody }>('/describe/batch', async (request) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as DescribeBatchBody;
    const result = await fm.describeFiles({ limit: body.limit });
    return { data: result };
  });

  app.post<{ Body: DescribeFileBody }>('/describe/file', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as DescribeFileBody;
    if (!body.path || !body.path.trim()) {
      return reply.status(400).send({ error: 'Missing required field: path' });
    }
    const result = await fm.describeFile(body.path.trim());
    const cost = fm.getDescriptionCost();
    return { data: { ...result, cost } };
  });

  app.get('/describe/cost', async () => {
    const fm = (app as any).fm as FileMom;
    return { data: { cost: fm.getDescriptionCost() } };
  });
}
