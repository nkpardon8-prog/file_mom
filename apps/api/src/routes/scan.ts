import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

interface ScanBody {
  folders?: string[];
  fullRescan?: boolean;
}

export async function scanRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ScanBody }>('/scan', async (request) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as ScanBody;

    const result = await fm.scan({
      folders: body.folders,
      fullRescan: body.fullRescan,
    });

    return { data: result };
  });
}
