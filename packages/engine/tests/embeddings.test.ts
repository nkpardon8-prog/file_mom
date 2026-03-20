import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock Transformers.js — returns deterministic embeddings based on text length
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockImplementation(async (text: string) => ({
      data: new Float32Array(384).fill(0).map((_, i) => Math.sin(i + text.length) * 0.1),
    })),
  ),
  env: { cacheDir: '' },
}));

import { Embeddings, type EmbeddingsConfig } from '../src/embeddings.js';

let tempDir: string;
let embeddings: Embeddings;

function makeConfig(overrides: Partial<EmbeddingsConfig> = {}): EmbeddingsConfig {
  return {
    model: 'all-MiniLM-L6-v2',
    dimensions: 384,
    dbPath: join(tempDir, 'embeddings-test.db'),
    cacheDir: join(tempDir, 'models'),
    ...overrides,
  };
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'filemom-emb-'));
  embeddings = new Embeddings(makeConfig());
  await embeddings.initialize();
});

afterEach(async () => {
  await embeddings.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('Embeddings', () => {
  // ============================================================
  // Lifecycle
  // ============================================================

  it('creates file_embeddings table on initialize', async () => {
    const count = await embeddings.getEmbeddedCount();
    expect(count).toBe(0);
  });

  it('throws when used before initialize', async () => {
    const uninit = new Embeddings(makeConfig());
    await expect(uninit.getEmbeddedCount()).rejects.toThrow('not initialized');
  });

  it('initialize is idempotent', async () => {
    await embeddings.initialize(); // already initialized in beforeEach
    const count = await embeddings.getEmbeddedCount();
    expect(count).toBe(0);
  });

  it('close cleans up resources', async () => {
    await embeddings.close();
    await expect(embeddings.getEmbeddedCount()).rejects.toThrow();
    // Reinitialize for afterEach
    embeddings = new Embeddings(makeConfig());
    await embeddings.initialize();
  });

  // ============================================================
  // Embedding generation
  // ============================================================

  it('generateEmbedding returns Float32Array of correct dimensions', async () => {
    const embedding = await embeddings.generateEmbedding('test text');
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(384);
  });

  it('generateEmbedding throws for empty text', async () => {
    await expect(embeddings.generateEmbedding('')).rejects.toThrow('empty text');
    await expect(embeddings.generateEmbedding('   ')).rejects.toThrow('empty text');
  });

  it('generateEmbedding produces different results for different text', async () => {
    const emb1 = await embeddings.generateEmbedding('hello world');
    const emb2 = await embeddings.generateEmbedding('completely different text here');
    // With our mock, different text lengths → different embeddings
    expect(emb1).not.toEqual(emb2);
  });

  // ============================================================
  // Storage
  // ============================================================

  it('embed stores embedding for file ID', async () => {
    await embeddings.embed(1, 'test content');
    expect(await embeddings.hasEmbedding(1)).toBe(true);
    expect(await embeddings.getEmbeddedCount()).toBe(1);
  });

  it('embed replaces existing embedding (upsert)', async () => {
    await embeddings.embed(1, 'original text');
    await embeddings.embed(1, 'updated text');
    expect(await embeddings.getEmbeddedCount()).toBe(1);
  });

  it('remove deletes embedding', async () => {
    await embeddings.embed(1, 'text');
    await embeddings.remove(1);
    expect(await embeddings.hasEmbedding(1)).toBe(false);
    expect(await embeddings.getEmbeddedCount()).toBe(0);
  });

  it('hasEmbedding returns false for nonexistent', async () => {
    expect(await embeddings.hasEmbedding(999)).toBe(false);
  });

  // ============================================================
  // Batch
  // ============================================================

  it('embedBatch processes multiple files', async () => {
    const result = await embeddings.embedBatch([
      { id: 1, text: 'first file content' },
      { id: 2, text: 'second file content' },
      { id: 3, text: 'third file content' },
    ]);

    expect(result.embedded).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(await embeddings.getEmbeddedCount()).toBe(3);
  });

  it('embedBatch skips files with empty text', async () => {
    const result = await embeddings.embedBatch([
      { id: 1, text: 'valid text' },
      { id: 2, text: '' },
      { id: 3, text: '   ' },
    ]);

    expect(result.embedded).toBe(1);
    expect(result.skipped).toBe(2);
    expect(await embeddings.getEmbeddedCount()).toBe(1);
  });

  it('embedBatch reports duration', async () => {
    const result = await embeddings.embedBatch([
      { id: 1, text: 'text' },
    ]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ============================================================
  // Search
  // ============================================================

  it('search returns results ordered by distance', async () => {
    await embeddings.embed(1, 'beach sunset vacation photo');
    await embeddings.embed(2, 'tax document financial report');
    await embeddings.embed(3, 'beach holiday trip pictures');

    const results = await embeddings.search('beach vacation');
    expect(results.length).toBeGreaterThan(0);
    // Results should be ordered by distance ascending
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
    }
  });

  it('search respects limit option', async () => {
    for (let i = 0; i < 10; i++) {
      await embeddings.embed(i + 1, `file content number ${i}`);
    }
    const results = await embeddings.search('file', { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('search returns empty array when no embeddings exist', async () => {
    const results = await embeddings.search('anything');
    expect(results).toHaveLength(0);
  });
});
