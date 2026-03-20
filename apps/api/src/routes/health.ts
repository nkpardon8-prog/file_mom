import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return { data: { status: 'ok', version: '0.1.0' } };
  });
}
