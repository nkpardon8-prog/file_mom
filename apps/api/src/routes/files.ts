import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

interface FileQuery {
  path?: string;
}

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: FileQuery }>('/files', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const filePath = request.query.path;

    if (!filePath) {
      return reply.status(400).send({ error: 'Missing required query parameter: path' });
    }

    const file = await fm.getFile(filePath);
    if (!file) {
      return reply.status(404).send({ error: `File not found: ${filePath}` });
    }

    return { data: file };
  });
}
