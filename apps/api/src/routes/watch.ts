import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

const wsClients = new Set<{ send: (data: string) => void; readyState: number }>();

function broadcastEvent(event: unknown): void {
  const data = JSON.stringify(event);
  for (const ws of wsClients) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

export async function watchRestRoutes(app: FastifyInstance): Promise<void> {
  app.post('/watch/start', async () => {
    const fm = (app as any).fm as FileMom;
    await fm.startWatching(broadcastEvent);
    return { data: { watching: true } };
  });

  app.post('/watch/stop', async () => {
    const fm = (app as any).fm as FileMom;
    await fm.stopWatching();
    return { data: { watching: false } };
  });

  app.get('/watch/status', async () => {
    const fm = (app as any).fm as FileMom;
    return { data: { watching: fm.isWatching, clients: wsClients.size } };
  });
}

export async function watchWsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/watch', { websocket: true }, (socket: any) => {
    wsClients.add(socket);
    socket.on('close', () => wsClients.delete(socket));
    socket.on('error', () => wsClients.delete(socket));
  });
}
