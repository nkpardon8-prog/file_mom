import { describe, it, expect } from 'vitest';
import { ConfigSchema, DEFAULT_CONFIG } from '../src/config.js';

const MINIMAL_VALID_CONFIG = {
  dataDir: '/tmp/filemom',
  watchedFolders: ['/Users/test/Documents'],
  openRouterApiKey: 'sk-or-test-key',
};

describe('ConfigSchema', () => {
  it('accepts minimal valid config and fills defaults', () => {
    const result = ConfigSchema.parse(MINIMAL_VALID_CONFIG);
    expect(result.dataDir).toBe('/tmp/filemom');
    expect(result.watchedFolders).toEqual(['/Users/test/Documents']);
    expect(result.openRouterApiKey).toBe('sk-or-test-key');
    // Defaults should be applied
    expect(result.model).toBe('anthropic/claude-sonnet-4');
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
      model: 'anthropic/claude-haiku-4.5',
      maxFilesPerRequest: 100,
      requestTimeoutMs: 10000,
      undoTTLMinutes: 60,
      maxConcurrentOps: 10,
      retryAttempts: 5,
      retryDelayMs: 2000,
      enableEmbeddings: true,
      embeddingModel: 'custom-model',
      embeddingDimensions: 768,
    };
    const result = ConfigSchema.parse(full);
    expect(result.maxTextLength).toBe(5000);
    expect(result.model).toBe('anthropic/claude-haiku-4.5');
    expect(result.embeddingDimensions).toBe(768);
  });

  it('rejects missing dataDir', () => {
    expect(() =>
      ConfigSchema.parse({ watchedFolders: ['/tmp'], openRouterApiKey: 'key' }),
    ).toThrow();
  });

  it('rejects empty watchedFolders', () => {
    expect(() =>
      ConfigSchema.parse({ dataDir: '/tmp', watchedFolders: [], openRouterApiKey: 'key' }),
    ).toThrow();
  });

  it('rejects missing openRouterApiKey', () => {
    expect(() =>
      ConfigSchema.parse({ dataDir: '/tmp', watchedFolders: ['/tmp'] }),
    ).toThrow();
  });

  it('rejects empty openRouterApiKey', () => {
    expect(() =>
      ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, openRouterApiKey: '' }),
    ).toThrow();
  });

  it('accepts any string as model (flexible model IDs)', () => {
    expect(() =>
      ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, model: 'google/gemini-2.5-flash' }),
    ).not.toThrow();
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

describe('ConfigSchema boundary values', () => {
  it('extractionTimeoutMs: rejects 999, accepts 1000, accepts 60000, rejects 60001', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, extractionTimeoutMs: 999 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, extractionTimeoutMs: 1000 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, extractionTimeoutMs: 60000 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, extractionTimeoutMs: 60001 })).toThrow();
  });

  it('maxConcurrentOps: rejects 0, accepts 1, accepts 50, rejects 51', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxConcurrentOps: 0 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxConcurrentOps: 1 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxConcurrentOps: 50 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxConcurrentOps: 51 })).toThrow();
  });

  it('retryAttempts: rejects -1, accepts 0, accepts 10, rejects 11', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryAttempts: -1 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryAttempts: 0 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryAttempts: 10 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryAttempts: 11 })).toThrow();
  });

  it('retryDelayMs: rejects 99, accepts 100, accepts 10000, rejects 10001', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryDelayMs: 99 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryDelayMs: 100 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryDelayMs: 10000 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryDelayMs: 10001 })).toThrow();
  });

  it('maxFilesPerRequest: rejects 9, accepts 10, accepts 1000, rejects 1001', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxFilesPerRequest: 9 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxFilesPerRequest: 10 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxFilesPerRequest: 1000 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxFilesPerRequest: 1001 })).toThrow();
  });

  it('requestTimeoutMs: rejects 4999, accepts 5000, accepts 120000, rejects 120001', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, requestTimeoutMs: 4999 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, requestTimeoutMs: 5000 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, requestTimeoutMs: 120000 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, requestTimeoutMs: 120001 })).toThrow();
  });

  it('embeddingDimensions: rejects 63, accepts 64, accepts 2048, rejects 2049', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, embeddingDimensions: 63 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, embeddingDimensions: 64 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, embeddingDimensions: 2048 })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, embeddingDimensions: 2049 })).toThrow();
  });

  it('rejects non-integer number values', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxTextLength: 5000.5 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxConcurrentOps: 10.1 })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, retryAttempts: 2.5 })).toThrow();
  });

  it('rejects wrong types (string where number expected)', () => {
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxTextLength: '5000' })).toThrow();
    expect(() => ConfigSchema.parse({ ...MINIMAL_VALID_CONFIG, maxConcurrentOps: '20' })).toThrow();
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has exclude patterns that include common ignores', () => {
    expect(DEFAULT_CONFIG.excludePatterns).toContain('**/node_modules/**');
    expect(DEFAULT_CONFIG.excludePatterns).toContain('**/.git/**');
    expect(DEFAULT_CONFIG.excludePatterns).toContain('**/.DS_Store');
  });

  it('uses sonnet as default model', () => {
    expect(DEFAULT_CONFIG.model).toBe('anthropic/claude-sonnet-4');
  });

  it('has 30-minute undo TTL', () => {
    expect(DEFAULT_CONFIG.undoTTLMinutes).toBe(30);
  });

  it('does not include **/. glob that would conflict with includeHidden', () => {
    expect(DEFAULT_CONFIG.excludePatterns).not.toContain('**/.*');
  });

  it('values pass ConfigSchema validation when combined with required fields', () => {
    const merged = { ...DEFAULT_CONFIG, ...MINIMAL_VALID_CONFIG };
    expect(() => ConfigSchema.parse(merged)).not.toThrow();
  });
});

describe('ConfigSchema excludePatterns default', () => {
  it('schema default matches DEFAULT_CONFIG', () => {
    const parsed = ConfigSchema.parse(MINIMAL_VALID_CONFIG);
    expect(parsed.excludePatterns).toEqual(DEFAULT_CONFIG.excludePatterns);
  });

  it('contains common ignores and does not contain **/.*', () => {
    const parsed = ConfigSchema.parse(MINIMAL_VALID_CONFIG);
    expect(parsed.excludePatterns).toContain('**/node_modules/**');
    expect(parsed.excludePatterns).toContain('**/.git/**');
    expect(parsed.excludePatterns).toContain('**/*.tmp');
    expect(parsed.excludePatterns).toContain('**/Thumbs.db');
    expect(parsed.excludePatterns).toContain('**/.DS_Store');
    expect(parsed.excludePatterns).not.toContain('**/.*');
  });
});
