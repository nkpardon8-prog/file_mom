import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

interface SearchQuery {
  q?: string;
  limit?: string;
  ext?: string;
  semantic?: string;
}

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: SearchQuery }>('/search', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const { q, limit, ext, semantic } = request.query;

    if (!q) {
      return { data: [] };
    }

    const parsedLimit = limit ? parseInt(limit, 10) || 20 : 20;
    const extensions = ext ? ext.split(',').map((e) => e.trim()).filter(Boolean) : undefined;
    const useSemantic = semantic === 'true';

    if (useSemantic) {
      try {
        const results = await fm.semanticSearch(q, { limit: parsedLimit, extensions });
        return { data: results };
      } catch {
        // Embeddings not enabled — fall back to keyword search
      }
    }

    const results = await fm.search(q, { limit: parsedLimit, extensions });
    return { data: results };
  });
}
