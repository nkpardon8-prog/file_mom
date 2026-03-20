import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Indexer } from '../src/indexer.js';
import type { FileRecord } from '../src/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let indexer: Indexer;
let tempDir: string;

function makeRecord(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 0,
    path: '/test/file.txt',
    name: 'file.txt',
    extension: 'txt',
    size: 1234,
    mtime: Date.now(),
    ctime: Date.now(),
    quickHash: 'abc123def456-1234',
    extractedText: null,
    exifJson: null,
    detectedMimeType: null,
    indexedAt: Date.now(),
    embeddingId: null,
    visionDescription: null,
    visionCategory: null,
    visionTags: null,
    enrichedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'filemom-idx-'));
  indexer = new Indexer({ dbPath: join(tempDir, 'test.db') });
  await indexer.initialize();
});

afterEach(async () => {
  await indexer.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('Indexer', () => {
  // ============================================================
  // Schema & Lifecycle
  // ============================================================

  it('creates database tables on initialize', async () => {
    const count = await indexer.getFileCount();
    expect(count).toBe(0);
  });

  it('throws when used before initialize', async () => {
    const uninit = new Indexer({ dbPath: ':memory:' });
    await expect(uninit.getFileCount()).rejects.toThrow('not initialized');
  });

  // ============================================================
  // CRUD
  // ============================================================

  it('inserts a file record', async () => {
    const record = makeRecord({ path: '/test/a.txt', name: 'a.txt' });
    await indexer.upsertFile(record);

    const result = await indexer.getByPath('/test/a.txt');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('a.txt');
    expect(result!.size).toBe(1234);
    expect(result!.quickHash).toBe('abc123def456-1234');
  });

  it('updates existing record on conflict', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/a.txt', size: 100 }));
    await indexer.upsertFile(makeRecord({ path: '/test/a.txt', size: 200 }));

    const result = await indexer.getByPath('/test/a.txt');
    expect(result!.size).toBe(200);

    const count = await indexer.getFileCount();
    expect(count).toBe(1);
  });

  it('deletes a file record', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/a.txt' }));
    await indexer.deleteFile('/test/a.txt');

    const result = await indexer.getByPath('/test/a.txt');
    expect(result).toBeNull();
  });

  it('handles deleting non-existent file gracefully', async () => {
    await expect(indexer.deleteFile('/nonexistent')).resolves.toBeUndefined();
  });

  it('returns null for non-existent path', async () => {
    const result = await indexer.getByPath('/nonexistent');
    expect(result).toBeNull();
  });

  it('stores and retrieves vision fields', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/test/photo.jpg',
      name: 'photo.jpg',
      extension: 'jpg',
      visionDescription: 'Beach sunset with two people',
      visionCategory: 'photo',
      visionTags: '["beach","sunset","people"]',
      enrichedAt: Date.now(),
    }));

    const result = await indexer.getByPath('/test/photo.jpg');
    expect(result!.visionDescription).toBe('Beach sunset with two people');
    expect(result!.visionCategory).toBe('photo');
    expect(result!.visionTags).toBe('["beach","sunset","people"]');
    expect(result!.enrichedAt).toBeGreaterThan(0);
  });

  it('stores and retrieves extracted text', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/test/doc.pdf',
      name: 'doc.pdf',
      extension: 'pdf',
      extractedText: 'Quarterly financial report Q4 2023',
    }));

    const result = await indexer.getByPath('/test/doc.pdf');
    expect(result!.extractedText).toBe('Quarterly financial report Q4 2023');
  });

  it('stores and retrieves EXIF JSON', async () => {
    const exif = JSON.stringify({ dateTaken: '2017-08-15', camera: 'iPhone 14 Pro' });
    await indexer.upsertFile(makeRecord({
      path: '/test/img.jpg',
      name: 'img.jpg',
      exifJson: exif,
    }));

    const result = await indexer.getByPath('/test/img.jpg');
    expect(JSON.parse(result!.exifJson!)).toEqual({ dateTaken: '2017-08-15', camera: 'iPhone 14 Pro' });
  });

  // ============================================================
  // Batch operations
  // ============================================================

  it('upserts multiple files in a transaction', async () => {
    const records = Array.from({ length: 100 }, (_, i) =>
      makeRecord({ path: `/test/file${i}.txt`, name: `file${i}.txt` }),
    );

    await indexer.upsertFiles(records);
    const count = await indexer.getFileCount();
    expect(count).toBe(100);
  });

  // ============================================================
  // Search (FTS5)
  // ============================================================

  it('finds files by filename via FTS5', async () => {
    await indexer.upsertFile(makeRecord({ path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf' }));
    await indexer.upsertFile(makeRecord({ path: '/docs/invoice.pdf', name: 'invoice.pdf', extension: 'pdf' }));
    await indexer.upsertFile(makeRecord({ path: '/pics/cat.jpg', name: 'cat.jpg', extension: 'jpg' }));

    const results = await indexer.search('report');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('report.pdf');
    expect(results[0].score).toBeLessThan(0); // bm25 scores are negative
  });

  it('finds files by extracted text via FTS5', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/docs/tax.pdf',
      name: 'tax.pdf',
      extractedText: 'Federal income tax return for 2023',
    }));
    await indexer.upsertFile(makeRecord({
      path: '/docs/other.pdf',
      name: 'other.pdf',
      extractedText: 'Meeting notes from Tuesday',
    }));

    const results = await indexer.search('tax');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('tax.pdf');
  });

  it('finds files by vision description via FTS5', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/pics/img001.jpg',
      name: 'img001.jpg',
      visionDescription: 'Beautiful beach sunset with palm trees',
    }));
    await indexer.upsertFile(makeRecord({
      path: '/pics/img002.jpg',
      name: 'img002.jpg',
      visionDescription: 'Office meeting room with whiteboard',
    }));

    const results = await indexer.search('beach sunset');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('img001.jpg');
  });

  it('returns snippets from extracted text', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/docs/report.pdf',
      name: 'report.pdf',
      extractedText: 'The quarterly revenue report shows a significant increase in profits during Q4 of 2023.',
    }));

    const results = await indexer.search('revenue');
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain('revenue');
  });

  it('returns empty array for empty query', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/a.txt' }));
    const results = await indexer.search('');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for no matches', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/a.txt', name: 'a.txt' }));
    const results = await indexer.search('zzzznonexistent');
    expect(results).toHaveLength(0);
  });

  it('filters search by extension', async () => {
    await indexer.upsertFile(makeRecord({ path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf' }));
    await indexer.upsertFile(makeRecord({ path: '/docs/report.docx', name: 'report.docx', extension: 'docx' }));

    const results = await indexer.search('report', { extensions: ['pdf'] });
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('pdf');
  });

  it('filters search by folder', async () => {
    await indexer.upsertFile(makeRecord({ path: '/docs/report.pdf', name: 'report.pdf' }));
    await indexer.upsertFile(makeRecord({ path: '/pics/report.jpg', name: 'report.jpg' }));

    const results = await indexer.search('report', { folders: ['/docs'] });
    expect(results).toHaveLength(1);
    expect(results[0].path).toContain('/docs');
  });

  it('respects search limit', async () => {
    for (let i = 0; i < 20; i++) {
      await indexer.upsertFile(makeRecord({
        path: `/docs/file${i}.pdf`,
        name: `file${i}.pdf`,
        extractedText: `This is report number ${i} about quarterly earnings`,
      }));
    }

    const results = await indexer.search('report quarterly', { limit: 5 });
    expect(results).toHaveLength(5);
  });

  // ============================================================
  // FTS5 trigger sync
  // ============================================================

  it('updates FTS5 index when record is updated', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/test/a.txt',
      name: 'a.txt',
      extractedText: 'original content about cats',
    }));

    // Should find 'cats'
    let results = await indexer.search('cats');
    expect(results).toHaveLength(1);

    // Update text — trigger should update FTS
    await indexer.upsertFile(makeRecord({
      path: '/test/a.txt',
      name: 'a.txt',
      extractedText: 'updated content about dogs',
    }));

    // Should no longer find 'cats'
    results = await indexer.search('cats');
    expect(results).toHaveLength(0);

    // Should find 'dogs'
    results = await indexer.search('dogs');
    expect(results).toHaveLength(1);
  });

  it('removes from FTS5 index when record is deleted', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/test/a.txt',
      name: 'a.txt',
      extractedText: 'searchable content',
    }));

    let results = await indexer.search('searchable');
    expect(results).toHaveLength(1);

    await indexer.deleteFile('/test/a.txt');

    results = await indexer.search('searchable');
    expect(results).toHaveLength(0);
  });

  // ============================================================
  // Queries
  // ============================================================

  it('gets all files by extension', async () => {
    await indexer.upsertFile(makeRecord({ path: '/a.pdf', name: 'a.pdf', extension: 'pdf' }));
    await indexer.upsertFile(makeRecord({ path: '/b.pdf', name: 'b.pdf', extension: 'pdf' }));
    await indexer.upsertFile(makeRecord({ path: '/c.txt', name: 'c.txt', extension: 'txt' }));

    const pdfs = await indexer.getAllByExtension('pdf');
    expect(pdfs).toHaveLength(2);
  });

  it('gets recent files ordered by mtime', async () => {
    await indexer.upsertFile(makeRecord({ path: '/old.txt', name: 'old.txt', mtime: 1000 }));
    await indexer.upsertFile(makeRecord({ path: '/new.txt', name: 'new.txt', mtime: 9000 }));
    await indexer.upsertFile(makeRecord({ path: '/mid.txt', name: 'mid.txt', mtime: 5000 }));

    const recent = await indexer.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].name).toBe('new.txt');
    expect(recent[1].name).toBe('mid.txt');
  });

  it('gets index stats', async () => {
    await indexer.upsertFile(makeRecord({ path: '/a.pdf', extension: 'pdf', size: 100 }));
    await indexer.upsertFile(makeRecord({ path: '/b.pdf', extension: 'pdf', size: 200 }));
    await indexer.upsertFile(makeRecord({ path: '/c.txt', extension: 'txt', size: 50 }));

    const stats = await indexer.getStats();
    expect(stats.totalFiles).toBe(3);
    expect(stats.totalSize).toBe(350);
    expect(stats.byExtension).toEqual({ pdf: 2, txt: 1 });
  });

  it('gets files by hash', async () => {
    await indexer.upsertFile(makeRecord({ path: '/a.txt', quickHash: 'hash1-100' }));
    await indexer.upsertFile(makeRecord({ path: '/b.txt', quickHash: 'hash1-100' }));
    await indexer.upsertFile(makeRecord({ path: '/c.txt', quickHash: 'hash2-200' }));

    const dupes = await indexer.getByHash('hash1-100');
    expect(dupes).toHaveLength(2);
  });

  // ============================================================
  // Search filters
  // ============================================================

  it('search handles FTS5 special characters without crashing', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/test/a.txt',
      name: 'a.txt',
      extractedText: 'the quick brown fox jumps over',
    }));

    // None of these should throw
    const specialQueries = ['quick*', '"unmatched', '(bad)', 'OR', 'NOT', 'NEAR/3', 'col:val', 'foo\\bar', 'AND'];
    for (const q of specialQueries) {
      await expect(indexer.search(q)).resolves.toBeDefined();
    }
  });

  it('sanitized query still finds results', async () => {
    await indexer.upsertFile(makeRecord({
      path: '/test/a.txt',
      name: 'a.txt',
      extractedText: 'important quarterly report data',
    }));

    // Normal multi-word search should still work after sanitization
    const results = await indexer.search('quarterly report');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('a.txt');
  });

  it('filters search by minSize', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/small.txt', name: 'small.txt', size: 100, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/medium.txt', name: 'medium.txt', size: 500, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/large.txt', name: 'large.txt', size: 1000, extractedText: 'test data' }));

    const results = await indexer.search('test', { minSize: 400 });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.size >= 400)).toBe(true);
  });

  it('filters search by maxSize', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/small.txt', name: 'small.txt', size: 100, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/medium.txt', name: 'medium.txt', size: 500, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/large.txt', name: 'large.txt', size: 1000, extractedText: 'test data' }));

    const results = await indexer.search('test', { maxSize: 600 });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.size <= 600)).toBe(true);
  });

  it('filters search by combined minSize AND maxSize', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/small.txt', name: 'small.txt', size: 100, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/medium.txt', name: 'medium.txt', size: 500, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/large.txt', name: 'large.txt', size: 1000, extractedText: 'test data' }));

    const results = await indexer.search('test', { minSize: 200, maxSize: 800 });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('medium.txt');
  });

  it('filters search by modifiedAfter', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/old.txt', name: 'old.txt', mtime: 1000, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/mid.txt', name: 'mid.txt', mtime: 5000, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/new.txt', name: 'new.txt', mtime: 9000, extractedText: 'test data' }));

    const results = await indexer.search('test', { modifiedAfter: new Date(4000) });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.mtime >= 4000)).toBe(true);
  });

  it('filters search by modifiedBefore', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/old.txt', name: 'old.txt', mtime: 1000, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/mid.txt', name: 'mid.txt', mtime: 5000, extractedText: 'test data' }));
    await indexer.upsertFile(makeRecord({ path: '/test/new.txt', name: 'new.txt', mtime: 9000, extractedText: 'test data' }));

    const results = await indexer.search('test', { modifiedBefore: new Date(6000) });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.mtime <= 6000)).toBe(true);
  });

  it('filters search by multiple criteria combined', async () => {
    await indexer.upsertFile(makeRecord({ path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf', size: 500, extractedText: 'quarterly earnings data' }));
    await indexer.upsertFile(makeRecord({ path: '/docs/report.docx', name: 'report.docx', extension: 'docx', size: 500, extractedText: 'quarterly earnings data' }));
    await indexer.upsertFile(makeRecord({ path: '/pics/report.jpg', name: 'report.jpg', extension: 'jpg', size: 500, extractedText: 'quarterly earnings data' }));
    await indexer.upsertFile(makeRecord({ path: '/docs/tiny.pdf', name: 'tiny.pdf', extension: 'pdf', size: 10, extractedText: 'quarterly earnings data' }));

    const results = await indexer.search('quarterly', { extensions: ['pdf'], folders: ['/docs'], minSize: 100 });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('report.pdf');
  });

  // ============================================================
  // Edge cases
  // ============================================================

  it('empty database getStats returns zeros', async () => {
    const stats = await indexer.getStats();
    expect(stats.totalFiles).toBe(0);
    expect(stats.totalSize).toBe(0);
    expect(stats.byExtension).toEqual({});
    expect(stats.watchedFolders).toEqual([]);
    expect(stats.oldestFile.getTime()).toBe(0);
    expect(stats.newestFile.getTime()).toBe(0);
    expect(stats.lastScanAt).toBeNull();
  });

  it('update verifies ALL fields change', async () => {
    const now = Date.now();
    await indexer.upsertFile(makeRecord({
      path: '/test/update.txt',
      name: 'update.txt',
      extension: 'txt',
      size: 100,
      mtime: 1000,
      ctime: 1000,
      quickHash: 'hash1-100',
      extractedText: 'original text',
      exifJson: null,
      indexedAt: now,
      embeddingId: null,
      visionDescription: null,
      visionCategory: null,
      visionTags: null,
      enrichedAt: null,
    }));

    const later = now + 1000;
    await indexer.upsertFile(makeRecord({
      path: '/test/update.txt',
      name: 'updated.txt',
      extension: 'md',
      size: 200,
      mtime: 2000,
      ctime: 2000,
      quickHash: 'hash2-200',
      extractedText: 'updated text',
      exifJson: '{"key":"val"}',
      indexedAt: later,
      embeddingId: 'emb-1',
      visionDescription: 'a document',
      visionCategory: 'document',
      visionTags: '["doc"]',
      enrichedAt: later,
    }));

    const result = await indexer.getByPath('/test/update.txt');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('updated.txt');
    expect(result!.extension).toBe('md');
    expect(result!.size).toBe(200);
    expect(result!.mtime).toBe(2000);
    expect(result!.ctime).toBe(2000);
    expect(result!.quickHash).toBe('hash2-200');
    expect(result!.extractedText).toBe('updated text');
    expect(result!.exifJson).toBe('{"key":"val"}');
    expect(result!.indexedAt).toBe(later);
    expect(result!.embeddingId).toBe('emb-1');
    expect(result!.visionDescription).toBe('a document');
    expect(result!.visionCategory).toBe('document');
    expect(result!.visionTags).toBe('["doc"]');
    expect(result!.enrichedAt).toBe(later);
  });

  it('batch upsert with duplicate paths: last write wins', async () => {
    const records = [
      makeRecord({ path: '/test/dup.txt', name: 'dup.txt', size: 100 }),
      makeRecord({ path: '/test/dup.txt', name: 'dup.txt', size: 999 }),
    ];

    await indexer.upsertFiles(records);
    const count = await indexer.getFileCount();
    expect(count).toBe(1);

    const result = await indexer.getByPath('/test/dup.txt');
    expect(result!.size).toBe(999);
  });

  // ============================================================
  // Persistence
  // ============================================================

  it('survives restart', async () => {
    await indexer.upsertFile(makeRecord({ path: '/test/persist.txt', name: 'persist.txt' }));
    const dbPath = join(tempDir, 'test.db');

    // Close and reopen
    await indexer.close();
    indexer = new Indexer({ dbPath });
    await indexer.initialize();

    const result = await indexer.getByPath('/test/persist.txt');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('persist.txt');

    // FTS still works after restart
    const searchResults = await indexer.search('persist');
    expect(searchResults).toHaveLength(1);
  });

  // ============================================================
  // searchByPath LIKE escaping
  // ============================================================

  it('searchByPath treats % in pattern as literal', async () => {
    await indexer.upsertFile(makeRecord({ path: '/data/100%_done.txt', name: '100%_done.txt' }));
    await indexer.upsertFile(makeRecord({ path: '/data/normal.txt', name: 'normal.txt' }));

    const results = await indexer.searchByPath('100%');
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('/data/100%_done.txt');
  });

  it('searchByPath treats _ in pattern as literal', async () => {
    await indexer.upsertFile(makeRecord({ path: '/data/file_v2.txt', name: 'file_v2.txt' }));
    await indexer.upsertFile(makeRecord({ path: '/data/fileXv2.txt', name: 'fileXv2.txt' }));

    const results = await indexer.searchByPath('file_v2');
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('/data/file_v2.txt');
  });

  it('searchByPath with normal pattern still works', async () => {
    await indexer.upsertFile(makeRecord({ path: '/docs/reports/q4.pdf', name: 'q4.pdf' }));
    await indexer.upsertFile(makeRecord({ path: '/docs/invoices/inv1.pdf', name: 'inv1.pdf' }));

    const results = await indexer.searchByPath('reports');
    expect(results).toHaveLength(1);
    expect(results[0].path).toContain('reports');
  });

  // ============================================================
  // getPathsInFolder + getFileCountInFolder
  // ============================================================

  it('getPathsInFolder returns paths under the given folder', async () => {
    await indexer.upsertFile(makeRecord({ path: '/docs/a.txt', name: 'a.txt' }));
    await indexer.upsertFile(makeRecord({ path: '/docs/sub/b.txt', name: 'b.txt' }));
    await indexer.upsertFile(makeRecord({ path: '/photos/c.jpg', name: 'c.jpg' }));

    const paths = await indexer.getPathsInFolder('/docs');
    expect(paths).toHaveLength(2);
    expect(paths).toContain('/docs/a.txt');
    expect(paths).toContain('/docs/sub/b.txt');
    expect(paths).not.toContain('/photos/c.jpg');
  });

  it('getPathsInFolder returns empty array for empty folder', async () => {
    const paths = await indexer.getPathsInFolder('/empty');
    expect(paths).toHaveLength(0);
  });

  it('getFileCountInFolder counts files under the given folder', async () => {
    await indexer.upsertFile(makeRecord({ path: '/docs/a.txt', name: 'a.txt' }));
    await indexer.upsertFile(makeRecord({ path: '/docs/sub/b.txt', name: 'b.txt' }));
    await indexer.upsertFile(makeRecord({ path: '/photos/c.jpg', name: 'c.jpg' }));

    expect(await indexer.getFileCountInFolder('/docs')).toBe(2);
    expect(await indexer.getFileCountInFolder('/photos')).toBe(1);
    expect(await indexer.getFileCountInFolder('/empty')).toBe(0);
  });
});
