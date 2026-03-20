import type { FastifyInstance } from 'fastify';
import type { FileMom } from '@filemom/engine';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.filemom');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const EDITABLE_FIELDS: Record<string, 'string' | 'number' | 'boolean' | 'string[]'> = {
  openRouterApiKey: 'string',
  model: 'string',
  excludePatterns: 'string[]',
  includeHidden: 'boolean',
  followSymlinks: 'boolean',
  enableVisionEnrichment: 'boolean',
  visionModel: 'string',
  visionBatchSize: 'number',
  enableEmbeddings: 'boolean',
  embeddingModel: 'string',
  maxFilesPerRequest: 'number',
  requestTimeoutMs: 'number',
  retryAttempts: 'number',
  retryDelayMs: 'number',
  maxConcurrentOps: 'number',
  undoTTLMinutes: 'number',
  maxRefinementRounds: 'number',
};

function maskKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '****';
  return key.slice(0, 8) + '...' + key.slice(-4);
}

async function readConfig(): Promise<Record<string, unknown>> {
  if (!existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(await readFile(CONFIG_FILE, 'utf-8')); } catch { return {}; }
}

async function saveConfig(config: Record<string, unknown>): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /settings — read config with masked key
  app.get('/settings', async () => {
    const config = await readConfig();
    const apiKey = (process.env['OPENROUTER_API_KEY'] as string) ?? (config.openRouterApiKey as string);
    return {
      data: {
        ...config,
        openRouterApiKey: maskKey(apiKey),
        hasApiKey: !!apiKey,
        configPath: CONFIG_FILE,
      },
    };
  });

  // PUT /settings — update any editable field
  app.put<{ Body: Record<string, unknown> }>('/settings', async (request, reply) => {
    const updates = (request.body ?? {}) as Record<string, unknown>;
    const config = await readConfig();
    const updatedFields: string[] = [];

    for (const [field, expectedType] of Object.entries(EDITABLE_FIELDS)) {
      if (updates[field] === undefined) continue;
      const val = updates[field];

      // Type validation
      if (expectedType === 'string' && typeof val !== 'string') {
        return reply.status(400).send({ error: `Field '${field}' must be a string` });
      }
      if (expectedType === 'number' && (typeof val !== 'number' || !Number.isFinite(val))) {
        return reply.status(400).send({ error: `Field '${field}' must be a number` });
      }
      if (expectedType === 'boolean' && typeof val !== 'boolean') {
        return reply.status(400).send({ error: `Field '${field}' must be a boolean` });
      }
      if (expectedType === 'string[]' && (!Array.isArray(val) || !val.every((v) => typeof v === 'string'))) {
        return reply.status(400).send({ error: `Field '${field}' must be an array of strings` });
      }

      config[field] = val;
      updatedFields.push(field);
    }

    if (updatedFields.length === 0) {
      return reply.status(400).send({ error: 'No valid fields to update' });
    }

    await saveConfig(config);

    // Hot-reload feature flags if they changed
    const fm = (app as any).fm as FileMom;
    const flagUpdates: { enableVisionEnrichment?: boolean; enableEmbeddings?: boolean } = {};
    if (updatedFields.includes('enableVisionEnrichment')) flagUpdates.enableVisionEnrichment = config.enableVisionEnrichment as boolean;
    if (updatedFields.includes('enableEmbeddings')) flagUpdates.enableEmbeddings = config.enableEmbeddings as boolean;
    if (Object.keys(flagUpdates).length > 0) {
      await fm.updateFeatureFlags(flagUpdates);
    }

    return { data: { saved: true, configPath: CONFIG_FILE, updatedFields } };
  });

  // POST /settings/folders — add watched folder with validation
  app.post<{ Body: { path?: string } }>('/settings/folders', async (request, reply) => {
    const folderPath = (request.body as any)?.path;
    if (!folderPath || typeof folderPath !== 'string') {
      return reply.status(400).send({ error: 'Missing required field: path' });
    }

    const resolved = resolve(folderPath);
    if (!existsSync(resolved)) {
      return reply.status(400).send({ error: `Path does not exist: ${resolved}` });
    }

    const fileStat = await stat(resolved);
    if (!fileStat.isDirectory()) {
      return reply.status(400).send({ error: `Not a directory: ${resolved}` });
    }

    const config = await readConfig();
    const folders: string[] = (config.watchedFolders as string[]) ?? [];
    if (folders.includes(resolved)) {
      return reply.status(409).send({ error: 'Folder already watched' });
    }

    folders.push(resolved);
    config.watchedFolders = folders;
    await saveConfig(config);
    return { data: { added: resolved, watchedFolders: folders } };
  });

  // DELETE /settings/folders — remove watched folder
  app.delete<{ Body: { path?: string } }>('/settings/folders', async (request, reply) => {
    const folderPath = (request.body as any)?.path;
    if (!folderPath) {
      return reply.status(400).send({ error: 'Missing required field: path' });
    }

    const config = await readConfig();
    const folders: string[] = (config.watchedFolders as string[]) ?? [];
    const index = folders.indexOf(folderPath);
    if (index === -1) {
      return reply.status(404).send({ error: 'Folder not in watched list' });
    }

    folders.splice(index, 1);
    config.watchedFolders = folders;
    await saveConfig(config);
    return { data: { removed: folderPath, watchedFolders: folders } };
  });

  // POST /settings/test-key — verify API key with OpenRouter
  app.post<{ Body: { apiKey?: string } }>('/settings/test-key', async (request) => {
    const config = await readConfig();
    const keyToTest = (request.body as any)?.apiKey
      ?? process.env['OPENROUTER_API_KEY']
      ?? (config.openRouterApiKey as string);

    if (!keyToTest) {
      return { data: { valid: false, error: 'No API key configured' } };
    }

    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${keyToTest}` },
      });
      return { data: { valid: res.ok, error: res.ok ? undefined : `OpenRouter returned ${res.status}` } };
    } catch (err) {
      return { data: { valid: false, error: err instanceof Error ? err.message : 'Connection failed' } };
    }
  });
}
