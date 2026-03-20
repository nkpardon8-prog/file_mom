import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from monorepo root (not CWD)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import { FileMom } from '@filemom/engine';
import type { FileMomConfig } from '@filemom/engine';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = await loadConfig();

if (!config.openRouterApiKey) {
  console.error('Missing OPENROUTER_API_KEY. Set it in your environment or ~/.filemom/config.json');
  process.exit(1);
}

if (!config.watchedFolders || config.watchedFolders.length === 0) {
  console.error('No watched folders configured. Run "filemom add <folder>" first.');
  process.exit(1);
}

const fullConfig: FileMomConfig = {
  ...config,
  watchedFolders: config.watchedFolders,
  openRouterApiKey: config.openRouterApiKey,
  dataDir: config.dataDir!,
} as FileMomConfig;

const fm = new FileMom(fullConfig);
await fm.initialize();

const app = await buildApp(fm);
const port = parseInt(process.env['PORT'] ?? '4000', 10);
await app.listen({ port, host: '0.0.0.0' });

console.log(`FileMom API running on http://localhost:${port}`);

const shutdown = async () => {
  console.log('\nShutting down...');
  await app.close();
  await fm.shutdown();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
