import { describe, it, expect } from 'vitest';
import { ConfigSchema, DEFAULT_CONFIG } from '../src/config.js';

const MINIMAL_VALID_CONFIG = {
  dataDir: '/tmp/filemom',
  watchedFolders: ['/Users/test/Documents'],
  anthropicApiKey: 'sk-ant-test-key',
};

describe('ConfigSchema', () => {
  it('accepts minimal valid config and fills defaults', () => {
    const result = ConfigSchema.parse(MINIMAL_VALID_CONFIG);
    expect(result.dataDir).toBe('/tmp/filemom');
    expect(result.watchedFolders).toEqual(['/Users/test/Documents']);
    expect(result.anthropicApiKey).toBe('sk-ant-test-key');
    // Defaults should be applied
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.maxFilesPerRequest).toBe(500);
    expect(result.undoTTLMinutes).toBe(30);
    expect(result.maxConcurrentOps).toBe(20);
    expect(result.includeHidden).toBe(false);
    expect(result.enableEmbeddings).toBe(false);
  });

  it('accepts full config with all fields', () => {
    const full = {
      ...MINIMAL_VALID_CONFIG,
      excludePatterns: ['**/*.tmp'],
      includeHidden: true,
      followSymlinks: true,
      maxTextLength: 5000,
      extractionTimeoutMs: 3000,
      skipExtensions: ['exe'],
      model: 'claude-haiku-4-20250514' as const,
      maxFilesPerRequest: 100,
      requestTimeoutMs: 10000,
      undoTTLMinutes: 60,
      maxConcurrentOps: 10,
      retryAttempts: 5,
      retryDelayMs: 2000,
      enableEmbeddings: true,
      embeddingModel: 'custom-model',
      lanceDbPath: '/tmp/lance',
    };
    const result = ConfigSchema.parse(full);
    expect(result.maxTextLength).toBe(5000);
    expect(result.model).toBe('claude-haiku-4-20250514');
    expect(result.lanceDbPath).toBe('/tmp/lance');
  });

  it('rejects missing dataDir', () => {
    expect(() =>
      ConfigSchema.parse({ watchedFolders: ['/tmp'], anthropicApiKey: 'key' }),
    ).toThrow();
  });

  it('rejects empty watchedFolders', () => {
    expect(() =>
      ConfigSchema.parse({ dataDir: '/tmp', watchedFolders: [], anthropicApiKey: 'key' }),
    ).toThrow();
  });

  it('rejects missing anthropicApiKey', () => {
    expect(() =>
      ConfigSchema.parse({ dataDir: '/tmp', watchedFolders: ['/tmp'] }),
    ).toThrow();
  });

  it('rejects empty anthropicApiKey', () => {
    expect(() =>
      ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, anthropicApiKey: '' }),
    ).toThrow();
  });

  it('rejects invalid model', () => {
    expect(() =>
      ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, model: 'gpt-4' }),
    ).toThrow();
  });

  it('rejects maxTextLength below minimum', () => {
    expect(() =>
      ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxTextLength: 50 }),
    ).toThrow();
  });

  it('rejects maxTextLength above maximum', () => {
    expect(() =>
      ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxTextLength: 200000 }),
    ).toThrow();
  });

  it('rejects undoTTLMinutes outside range', () => {
    expect(() =>
      ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, undoTTLMinutes: 2 }),
    ).toThrow();
    expect(() =>
      ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, undoTTLMinutes: 2000 }),
    ).toThrow();
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has exclude patterns that include common ignores', () => {
    expect(DEFAULT_CONFIG.excludePatterns).toContain('**/node_modules/**');
    expect(DEFAULT_CONFIG.excludePatterns).toContain('**/.git/**');
    expect(DEFAULT_CONFIG.excludePatterns).toContain('**/.DS_Store');
  });

  it('uses sonnet as default model', () => {
    expect(DEFAULT_CONFIG.model).toBe('claude-sonnet-4-20250514');
  });

  it('has 30-minute undo TTL', () => {
    expect(DEFAULT_CONFIG.undoTTLMinutes).toBe(30);
  });

  it('values pass ConfigSchema validation when combined with required fields', () => {
    const merged = { ...DEFAULT_CONFIG, ...MINIMAL_VALID_CONFIG };
    expect(() => ConfigSchema.parse(merged)).not.toThrow();
  });
});
