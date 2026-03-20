import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs before importing config
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadConfig, readStoredConfig, saveConfig, CONFIG_DIR, CONFIG_FILE } from '../src/utils/config.js';

// Save/restore env vars
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
  savedEnv = {
    OPENROUTER_API_KEY: process.env['OPENROUTER_API_KEY'],
    FILEMOM_DATA_DIR: process.env['FILEMOM_DATA_DIR'],
    FILEMOM_MODEL: process.env['FILEMOM_MODEL'],
  };
  delete process.env['OPENROUTER_API_KEY'];
  delete process.env['FILEMOM_DATA_DIR'];
  delete process.env['FILEMOM_MODEL'];
});

afterEach(() => {
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
});

// ============================================================
// loadConfig
// ============================================================

describe('loadConfig', () => {
  it('returns defaults when no config file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const config = await loadConfig();
    expect(config.dataDir).toBe(CONFIG_DIR);
    expect(config.watchedFolders).toEqual([]);
    expect(config.model).toBe('anthropic/claude-sonnet-4');
  });

  it('merges config file values over defaults', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({
      watchedFolders: ['/Users/x/Documents'],
      model: 'custom-model',
    }));

    const config = await loadConfig();
    expect(config.watchedFolders).toEqual(['/Users/x/Documents']);
    expect(config.model).toBe('custom-model');
  });

  it('env OPENROUTER_API_KEY overrides config file value', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({
      openRouterApiKey: 'file-key',
    }));
    process.env['OPENROUTER_API_KEY'] = 'env-key';

    const config = await loadConfig();
    expect(config.openRouterApiKey).toBe('env-key');
  });

  it('env FILEMOM_DATA_DIR overrides dataDir', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    process.env['FILEMOM_DATA_DIR'] = '/custom/dir';

    const config = await loadConfig();
    expect(config.dataDir).toBe('/custom/dir');
  });

  it('env FILEMOM_MODEL overrides model', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    process.env['FILEMOM_MODEL'] = 'env-model';

    const config = await loadConfig();
    expect(config.model).toBe('env-model');
  });

  it('handles corrupt config file gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue('not-json{{{');

    const config = await loadConfig();
    // Falls back to defaults
    expect(config.dataDir).toBe(CONFIG_DIR);
    expect(config.watchedFolders).toEqual([]);
  });
});

// ============================================================
// readStoredConfig
// ============================================================

describe('readStoredConfig', () => {
  it('returns null when file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await readStoredConfig();
    expect(result).toBeNull();
  });

  it('returns parsed config object when file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({
      watchedFolders: ['/docs'],
      model: 'test-model',
    }));

    const result = await readStoredConfig();
    expect(result).toEqual({ watchedFolders: ['/docs'], model: 'test-model' });
  });
});

// ============================================================
// saveConfig
// ============================================================

describe('saveConfig', () => {
  it('creates directory and writes config file', async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    await saveConfig({ watchedFolders: ['/docs'] });

    expect(mkdir).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      CONFIG_FILE,
      expect.any(String),
      'utf-8',
    );
  });

  it('serializes config as pretty-printed JSON with trailing newline', async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const config = { watchedFolders: ['/test'], model: 'test' };
    await saveConfig(config);

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toBe(JSON.stringify(config, null, 2) + '\n');
  });
});
