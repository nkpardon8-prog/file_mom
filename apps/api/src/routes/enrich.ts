import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

interface EnrichBatchBody {
  limit?: number;
}

interface EnrichFileBody {
  path: string;
}

interface EmbedBody {
  limit?: number;
}

export async function enrichRoutes(app: FastifyInstance): Promise<void> {
  app.get('/enrich/status', async () => {
    const fm = (app as any).fm as FileMom;
    const flags = fm.getFeatureFlags();
    const unenrichedCount = flags.enableVisionEnrichment ? await fm.getUnenrichedCount() : 0;
    const unembeddedCount = flags.enableEmbeddings ? await fm.getUnembeddedCount() : 0;
    return {
      data: {
        unenrichedCount,
        unembeddedCount,
        enableVisionEnrichment: flags.enableVisionEnrichment,
        enableEmbeddings: flags.enableEmbeddings,
      },
    };
  });

  app.post<{ Body: EnrichBatchBody }>('/enrich/batch', async (request) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as EnrichBatchBody;
    const result = await fm.enrichFiles({ limit: body.limit });
    return { data: result };
  });

  app.post<{ Body: EnrichFileBody }>('/enrich/file', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as EnrichFileBody;
    if (!body.path || !body.path.trim()) {
      return reply.status(400).send({ error: 'Missing required field: path' });
    }
    const result = await fm.enrichFile(body.path.trim());
    const cost = fm.getVisionCost();
    return { data: { ...result, cost } };
  });

  app.post<{ Body: EmbedBody }>('/embed', async (request) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as EmbedBody;
    const result = await fm.embedFiles({ limit: body.limit });
    return { data: result };
  });
}
