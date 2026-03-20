import { describe, it, expect } from 'vitest';

// Import everything through the public barrel — this IS the e2e surface test
import {
  // Classes
  Scanner,
  Extractor,
  Indexer,
  Watcher,
  AIInterface,
  Executor,
  TransactionLog,
  Embeddings,
  // Config
  ConfigSchema,
  DEFAULT_CONFIG,
  // Errors
  FileMomError,
  ScanError,
  ExtractionError,
  AIError,
  ExecutionError,
  ValidationError,
  // AI schemas & prompts
  ActionSchema,
  ActionPlanSchema,
  SYSTEM_PROMPT,
  buildUserPrompt,
  // Utilities
  normalizePath,
  isWithinFolder,
} from '../../src/index.js';

describe('Public API surface', () => {
  it('exports all component classes', () => {
    expect(Scanner).toBeDefined();
    expect(Extractor).toBeDefined();
    expect(Indexer).toBeDefined();
    expect(Watcher).toBeDefined();
    expect(AIInterface).toBeDefined();
    expect(Executor).toBeDefined();
    expect(TransactionLog).toBeDefined();
    expect(Embeddings).toBeDefined();
  });

  it('exports config schema and defaults', () => {
    expect(ConfigSchema).toBeDefined();
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(typeof DEFAULT_CONFIG.model).toBe('string');
  });

  it('exports all error classes', () => {
    expect(FileMomError).toBeDefined();
    expect(ScanError).toBeDefined();
    expect(ExtractionError).toBeDefined();
    expect(AIError).toBeDefined();
    expect(ExecutionError).toBeDefined();
    expect(ValidationError).toBeDefined();
  });

  it('exports AI schemas and prompt utilities', () => {
    expect(ActionSchema).toBeDefined();
    expect(ActionPlanSchema).toBeDefined();
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(typeof buildUserPrompt).toBe('function');
  });

  it('exports path utilities', () => {
    expect(typeof normalizePath).toBe('function');
    expect(typeof isWithinFolder).toBe('function');
  });
});

describe('Component instantiation', () => {
  it('Scanner can be constructed', () => {
    const scanner = new Scanner({
      excludePatterns: [],
      includeHidden: false,
      followSymlinks: false,
    });
    expect(scanner).toBeInstanceOf(Scanner);
  });

  it('Extractor can be constructed', () => {
    const extractor = new Extractor({
      maxTextLength: 10000,
      timeoutMs: 5000,
      skipExtensions: [],
    });
    expect(extractor).toBeInstanceOf(Extractor);
  });

  it('Indexer can be constructed', () => {
    const indexer = new Indexer({ dbPath: '/tmp/test.db' });
    expect(indexer).toBeInstanceOf(Indexer);
  });

  it('Watcher can be constructed', () => {
    const watcher = new Watcher({
      watchedFolders: ['/tmp'],
      debounceMs: 100,
      excludePatterns: [],
      followSymlinks: false,
      includeHidden: false,
    });
    expect(watcher).toBeInstanceOf(Watcher);
  });

  it('AIInterface can be constructed', () => {
    const ai = new AIInterface({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
      maxFilesPerRequest: 500,
      requestTimeoutMs: 30000,
    });
    expect(ai).toBeInstanceOf(AIInterface);
  });

  it('Executor can be constructed', () => {
    const executor = new Executor({
      maxConcurrent: 20,
      retryAttempts: 3,
      retryDelayMs: 1000,
    });
    expect(executor).toBeInstanceOf(Executor);
  });

  it('TransactionLog can be constructed', () => {
    const log = new TransactionLog({
      dbPath: '/tmp/test.db',
      ttlMinutes: 30,
    });
    expect(log).toBeInstanceOf(TransactionLog);
  });

  it('Embeddings can be constructed', () => {
    const emb = new Embeddings({
      model: 'all-MiniLM-L6-v2',
      dimensions: 384,
      dbPath: '/tmp/test-embeddings.db',
    });
    expect(emb).toBeInstanceOf(Embeddings);
  });
});

describe('Config → Validate → Use roundtrip', () => {
  it('parses minimal config and produces usable output', () => {
    const raw = {
      dataDir: '/tmp/filemom',
      watchedFolders: ['/Users/test/Documents'],
      openRouterApiKey: 'sk-or-test',
    };
    const config = ConfigSchema.parse(raw);

    // Can construct components from parsed config
    const scanner = new Scanner({
      excludePatterns: config.excludePatterns,
      includeHidden: config.includeHidden,
      followSymlinks: config.followSymlinks,
    });
    expect(scanner).toBeInstanceOf(Scanner);

    const ai = new AIInterface({
      apiKey: config.openRouterApiKey,
      model: config.model,
      maxFilesPerRequest: config.maxFilesPerRequest,
      requestTimeoutMs: config.requestTimeoutMs,
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
      maxRefinementRounds: config.maxRefinementRounds,
    });
    expect(ai).toBeInstanceOf(AIInterface);
  });
});

describe('Error hierarchy', () => {
  it('all error subclasses are instanceof FileMomError and Error', () => {
    const errors = [
      new ScanError('/path', new Error('fail')),
      new ExtractionError('/path', new Error('fail')),
      new AIError('fail'),
      new ExecutionError('id', 'fail'),
      new ValidationError('fail', []),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(FileMomError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

// Placeholder tests for future phases
describe('End to End (Phase 7)', () => {
  it.todo('completes full organize workflow');
  it.todo('undoes operations correctly');
  it.todo('recovers from partial failures');
});
