import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import type { FileMomConfig } from '@filemom/engine';

/** Default path for the filemom configuration directory */
export const CONFIG_DIR = join(homedir(), '.filemom');

/** Default path for the filemom config file */
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/** Partial config as stored on disk (all fields optional except watchedFolders) */
export interface StoredConfig {
  dataDir?: string;
  watchedFolders?: string[];
  openRouterApiKey?: string;
  model?: string;
  excludePatterns?: string[];
  includeHidden?: boolean;
  followSymlinks?: boolean;
  maxFilesPerRequest?: number;
}

/**
 * Load configuration by merging (in priority order):
 *   1. Defaults
 *   2. ~/.filemom/config.json (if exists)
 *   3. Environment variables
 */
export async function loadConfig(): Promise<Partial<FileMomConfig>> {
  const defaults: Partial<FileMomConfig> = {
    dataDir: CONFIG_DIR,
    watchedFolders: [],
    model: 'anthropic/claude-sonnet-4',
  };

  // Layer 2: config file
  let fileConfig: StoredConfig = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = await readFile(CONFIG_FILE, 'utf-8');
      fileConfig = JSON.parse(raw) as StoredConfig;
    } catch {
      // Ignore corrupt config file — will use defaults + env
    }
  }

  // Layer 3: environment variable overrides
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

/**
 * Read the stored config file (raw JSON). Returns null if it doesn't exist.
 */
export async function readStoredConfig(): Promise<StoredConfig | null> {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  const raw = await readFile(CONFIG_FILE, 'utf-8');
  return JSON.parse(raw) as StoredConfig;
}

/**
 * Write config to ~/.filemom/config.json, creating the directory if needed.
 */
export async function saveConfig(config: StoredConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
