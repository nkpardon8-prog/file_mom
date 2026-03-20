import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import type { FileMomConfig } from '@filemom/engine';

export const CONFIG_DIR = join(homedir(), '.filemom');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface StoredConfig {
  dataDir?: string;
  watchedFolders?: string[];
  openRouterApiKey?: string;
  model?: string;
  excludePatterns?: string[];
  includeHidden?: boolean;
  followSymlinks?: boolean;
  maxFilesPerRequest?: number;
  enableVisionEnrichment?: boolean;
  enableEmbeddings?: boolean;
}

export async function loadConfig(): Promise<Partial<FileMomConfig>> {
  const defaults: Partial<FileMomConfig> = {
    dataDir: CONFIG_DIR,
    watchedFolders: [],
    model: 'anthropic/claude-sonnet-4',
  };

  let fileConfig: StoredConfig = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = await readFile(CONFIG_FILE, 'utf-8');
      fileConfig = JSON.parse(raw) as StoredConfig;
    } catch {
      // Ignore corrupt config — use defaults + env
    }
  }

  const envOverrides: Partial<FileMomConfig> = {};
  if (process.env['OPENROUTER_API_KEY']) {
    envOverrides.openRouterApiKey = process.env['OPENROUTER_API_KEY'];
  }
  if (process.env['FILEMOM_DATA_DIR']) {
    envOverrides.dataDir = process.env['FILEMOM_DATA_DIR'];
  }
  if (process.env['FILEMOM_MODEL']) {
    envOverrides.model = process.env['FILEMOM_MODEL'];
  }

  return {
    ...defaults,
    ...fileConfig,
    ...envOverrides,
  };
}
