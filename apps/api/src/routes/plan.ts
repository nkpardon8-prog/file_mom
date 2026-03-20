import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';

interface PlanBody {
  command: string;
  previewOnly?: boolean;
}

interface RefineBody {
  plan: unknown;
  feedback: string;
  history?: string[];
}

export async function planRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: PlanBody }>('/plan', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as PlanBody;

    if (!body.command || body.command.trim().length === 0) {
      return reply.status(400).send({ error: 'Missing required field: command' });
    }

    const plan = await fm.plan(body.command.trim(), { previewOnly: body.previewOnly });
    const expansion = fm.getLastExpansion();
    const cost = fm.getAICost();

    return { data: { plan, expansion, cost } };
  });

  app.post<{ Body: RefineBody }>('/plan/refine', async (request, reply) => {
    const fm = (app as any).fm as FileMom;
    const body = (request.body ?? {}) as RefineBody;

    if (!body.plan || !body.feedback) {
      return reply.status(400).send({ error: 'Missing required fields: plan, feedback' });
    }

    const plan = await fm.refinePlan({
      plan: body.plan as any,
      feedback: body.feedback,
      history: body.history ?? [],
    });
    const cost = fm.getAICost();

    return { data: { plan, cost } };
  });
}
