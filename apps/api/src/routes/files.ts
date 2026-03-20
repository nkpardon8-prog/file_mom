import type { FastifyInstance } from 'fastify';
import type { FileMom, BrowseOptions } from '@filemom/engine';

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

  app.get<{ Querystring: Record<string, string> }>('/files/browse', async (request) => {
    const fm = (app as any).fm as FileMom;
    const { q, category, contentType, dateContext, source, sensitive, tags, ext, folder, limit, offset } = request.query;

    const options: BrowseOptions = {};
    if (q) options.q = q;
    if (category) options.category = category;
    if (contentType) options.contentType = contentType;
    if (dateContext) options.dateContext = dateContext;
    if (source) options.source = source;
    if (sensitive === 'true') options.sensitive = true;
    if (tags) options.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (ext) options.extensions = ext.split(',').map((e) => e.trim()).filter(Boolean);
    if (folder) options.folders = [folder];
    if (limit) options.limit = parseInt(limit, 10) || 50;
    if (offset) options.offset = parseInt(offset, 10) || 0;

    const results = await fm.browseFiles(options);
    return { data: results };
  });

  app.get('/files/browse/filters', async () => {
    const fm = (app as any).fm as FileMom;
    const options = await fm.getFilterOptions();
    return { data: options };
  });

  app.get('/files/export', async () => {
    const fm = (app as any).fm as FileMom;
    const records = await fm.exportDescriptions();
    return { data: records };
  });

  app.post<{ Body: { source?: string; destination?: string } }>('/files/move', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const { source, destination } = (request.body ?? {}) as { source?: string; destination?: string };
    if (!source?.trim() || !destination?.trim()) {
      return reply.status(400).send({ error: 'Missing required fields: source, destination' });
    }
    const result = await fm.moveFile(source.trim(), destination.trim());
    return { data: result };
  });

  app.post<{ Body: { source?: string; destination?: string } }>('/files/copy', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const { source, destination } = (request.body ?? {}) as { source?: string; destination?: string };
    if (!source?.trim() || !destination?.trim()) {
      return reply.status(400).send({ error: 'Missing required fields: source, destination' });
    }
    const result = await fm.copyFile(source.trim(), destination.trim());
    return { data: result };
  });

  app.post<{ Body: { path?: string; newName?: string } }>('/files/rename', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const { path, newName } = (request.body ?? {}) as { path?: string; newName?: string };
    if (!path?.trim() || !newName?.trim()) {
      return reply.status(400).send({ error: 'Missing required fields: path, newName' });
    }
    const trimmedName = newName.trim();
    if (trimmedName.includes('/') || trimmedName.includes('\\') || trimmedName.includes('..')) {
      return reply.status(400).send({ error: 'Invalid name: must not contain path separators or ".."' });
    }
    const result = await fm.renameFile(path.trim(), trimmedName);
    return { data: result };
  });

  app.post<{ Body: { path?: string } }>('/files/delete', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const { path } = (request.body ?? {}) as { path?: string };
    if (!path?.trim()) {
      return reply.status(400).send({ error: 'Missing required field: path' });
    }
    const result = await fm.deleteFile(path.trim());
    return { data: result };
  });
}
