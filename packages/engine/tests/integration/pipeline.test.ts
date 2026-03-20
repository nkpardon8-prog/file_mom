import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scanner } from '../../src/scanner.js';
import { Extractor } from '../../src/extractor.js';
import { Indexer } from '../../src/indexer.js';
import { FileMom } from '../../src/filemom.js';
import type { FileRecord, ScannedFile, ExtractedMetadata } from '../../src/types.js';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;
let filesDir: string;
let dataDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'filemom-pipeline-'));
  filesDir = join(tempDir, 'files');
  dataDir = join(tempDir, 'data');
  await mkdir(filesDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function buildRecord(scanned: ScannedFile, extracted: ExtractedMetadata): FileRecord {
  return {
    id: 0,
    path: scanned.path,
    name: scanned.name,
    extension: scanned.extension,
    size: scanned.size,
    mtime: scanned.mtime,
    ctime: scanned.ctime,
    quickHash: extracted.quickHash,
    extractedText: extracted.extractedText,
    exifJson: extracted.exif ? JSON.stringify(extracted.exif) : null,
    indexedAt: Date.now(),
    embeddingId: null,
    visionDescription: null,
    visionCategory: null,
    visionTags: null,
    enrichedAt: null,
    detectedMimeType: extracted.detectedMimeType ?? null,
    aiDescription: null,
    aiCategory: null,
    aiSubcategory: null,
    aiTags: null,
    aiDateContext: null,
    aiSource: null,
    aiContentType: null,
    aiConfidence: null,
    aiSensitive: null,
    aiSensitiveType: null,
    aiDetails: null,
    aiDescribedAt: null,
    aiDescriptionModel: null,
  };
}

describe('Pipeline Integration', () => {
  it('Scanner → Extractor: scan files then extract metadata', async () => {
    await writeFile(join(filesDir, 'hello.txt'), 'hello world');
    await writeFile(join(filesDir, 'data.json'), '{"key": "value"}');

    const scanner = new Scanner({ excludePatterns: [], includeHidden: false, followSymlinks: false });
    const extractor = new Extractor({ maxTextLength: 10000, timeoutMs: 5000, skipExtensions: [] });

    const scannedFiles = await scanner.scanAll([filesDir]);
    expect(scannedFiles).toHaveLength(2);

    for (const scanned of scannedFiles) {
      const extracted = await extractor.extract(scanned.path);
      expect(extracted.quickHash).toMatch(/^[0-9a-f]{16}-\d+$/);
      expect(extracted.extractionError).toBeNull();
      expect(extracted.path).toBe(scanned.path);
    }
  });

  it('Scanner → Extractor → Indexer: full pipeline with FTS5 search', async () => {
    await writeFile(join(filesDir, 'report.txt'), 'quarterly revenue analysis');
    await writeFile(join(filesDir, 'notes.txt'), 'meeting notes from tuesday');

    const scanner = new Scanner({ excludePatterns: [], includeHidden: false, followSymlinks: false });
    const extractor = new Extractor({ maxTextLength: 10000, timeoutMs: 5000, skipExtensions: [] });
    const indexer = new Indexer({ dbPath: join(dataDir, 'test.db') });
    await indexer.initialize();

    try {
      const scannedFiles = await scanner.scanAll([filesDir]);
      const records: FileRecord[] = [];

      for (const scanned of scannedFiles) {
        const extracted = await extractor.extract(scanned.path);
        records.push(buildRecord(scanned, extracted));
      }

      await indexer.upsertFiles(records);

      // Verify data is indexed
      const count = await indexer.getFileCount();
      expect(count).toBe(2);

      // Verify FTS5 search works on filenames
      const byName = await indexer.search('report');
      expect(byName).toHaveLength(1);
      expect(byName[0].name).toBe('report.txt');

      // Verify getByPath works
      const record = await indexer.getByPath(records[0].path);
      expect(record).not.toBeNull();
      expect(record!.quickHash).toMatch(/^[0-9a-f]{16}-/);
    } finally {
      await indexer.close();
    }
  });

  it('Re-scan detects file changes', async () => {
    const filePath = join(filesDir, 'changing.txt');
    await writeFile(filePath, 'version 1');

    const scanner = new Scanner({ excludePatterns: [], includeHidden: false, followSymlinks: false });
    const extractor = new Extractor({ maxTextLength: 10000, timeoutMs: 5000, skipExtensions: [] });
    const indexer = new Indexer({ dbPath: join(dataDir, 'test.db') });
    await indexer.initialize();

    try {
      // First scan
      let scanned = await scanner.scanAll([filesDir]);
      let extracted = await extractor.extract(scanned[0].path);
      const record1 = buildRecord(scanned[0], extracted);
      await indexer.upsertFile(record1);

      const original = await indexer.getByPath(filePath);
      const originalHash = original!.quickHash;

      // Modify file
      await writeFile(filePath, 'version 2 with much more content to change hash');

      // Re-scan
      scanned = await scanner.scanAll([filesDir]);
      extracted = await extractor.extract(scanned[0].path);
      const record2 = buildRecord(scanned[0], extracted);
      await indexer.upsertFile(record2);

      const updated = await indexer.getByPath(filePath);
      expect(updated!.quickHash).not.toBe(originalHash);
      expect(updated!.size).toBeGreaterThan(original!.size);

      // Still only 1 record (upsert, not duplicate)
      const count = await indexer.getFileCount();
      expect(count).toBe(1);
    } finally {
      await indexer.close();
    }
  });

  it('Delete from index removes from FTS5 search', async () => {
    await writeFile(join(filesDir, 'deleteme.txt'), 'unique searchable content');

    const scanner = new Scanner({ excludePatterns: [], includeHidden: false, followSymlinks: false });
    const extractor = new Extractor({ maxTextLength: 10000, timeoutMs: 5000, skipExtensions: [] });
    const indexer = new Indexer({ dbPath: join(dataDir, 'test.db') });
    await indexer.initialize();

    try {
      const scanned = await scanner.scanAll([filesDir]);
      const extracted = await extractor.extract(scanned[0].path);
      await indexer.upsertFile(buildRecord(scanned[0], extracted));

      // Verify searchable
      let results = await indexer.search('deleteme');
      expect(results).toHaveLength(1);

      // Delete
      await indexer.deleteFile(scanned[0].path);

      // Verify gone from search
      results = await indexer.search('deleteme');
      expect(results).toHaveLength(0);

      // Verify gone from getByPath
      const record = await indexer.getByPath(scanned[0].path);
      expect(record).toBeNull();
    } finally {
      await indexer.close();
    }
  });

  it('FileMom orchestrator end-to-end: scan, search, getFile', async () => {
    await writeFile(join(filesDir, 'quarterly-report.txt'), 'Q4 revenue summary');
    await writeFile(join(filesDir, 'invoice.txt'), 'billing details');
    await writeFile(join(filesDir, 'photo.jpg'), 'fake image data');

    const filemom = new FileMom({
      dataDir,
      watchedFolders: [filesDir],
      openRouterApiKey: 'test-key',
      skipExtensions: [],
    });
    await filemom.initialize();

    try {
      // Scan
      const scanResult = await filemom.scan();
      expect(scanResult.totalFiles).toBe(3);
      expect(scanResult.newFiles).toBe(3);
      expect(scanResult.errors).toHaveLength(0);

      // Search by name
      const searchResults = await filemom.search('quarterly');
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toBe('quarterly-report.txt');

      // Get file
      const file = await filemom.getFile(join(filesDir, 'invoice.txt'));
      expect(file).not.toBeNull();
      expect(file!.name).toBe('invoice.txt');
      expect(file!.quickHash).toMatch(/^[0-9a-f]{16}-/);

      // Stats
      const stats = await filemom.getStats();
      expect(stats.totalFiles).toBe(3);
      expect(stats.totalSize).toBeGreaterThan(0);
    } finally {
      await filemom.shutdown();
    }
  });

  it('V2 E2E: scan → browse with AI fields → filter by folder → file operations', async () => {
    const docsDir = join(filesDir, 'docs');
    const photosDir = join(filesDir, 'photos');
    await mkdir(docsDir, { recursive: true });
    await mkdir(photosDir, { recursive: true });
    await writeFile(join(docsDir, 'invoice.pdf'), 'fake pdf content');
    await writeFile(join(docsDir, 'report.txt'), 'quarterly revenue analysis');
    await writeFile(join(photosDir, 'beach.jpg'), 'fake image data');

    const filemom = new FileMom({
      dataDir,
      watchedFolders: [filesDir],
      openRouterApiKey: 'test-key',
      skipExtensions: [],
    });
    await filemom.initialize();

    try {
      // 1. Scan
      const scanResult = await filemom.scan();
      expect(scanResult.totalFiles).toBe(3);

      // 2. Manually set AI fields (simulates Describer output)
      const invoice = await filemom.getFile(join(docsDir, 'invoice.pdf'));
      expect(invoice).not.toBeNull();
      const indexer = (filemom as any)._indexer;
      await indexer.upsertFile({
        ...invoice!,
        aiDescription: 'Invoice from Amazon for electronics',
        aiCategory: 'financial',
        aiSubcategory: 'invoice',
        aiTags: '["amazon","electronics"]',
        aiContentType: 'document',
        aiConfidence: 0.92,
        aiSensitive: true,
        aiSensitiveType: 'financial',
        aiDescribedAt: Date.now(),
        aiDescriptionModel: 'test-model',
      });

      // 3. Browse all files
      const allFiles = await filemom.browseFiles();
      expect(allFiles.length).toBe(3);

      // 4. Browse by folder
      const docsOnly = await filemom.browseFiles({ folders: [docsDir] });
      expect(docsOnly.length).toBe(2);
      expect(docsOnly.every((f) => f.path.startsWith(docsDir))).toBe(true);

      const photosOnly = await filemom.browseFiles({ folders: [photosDir] });
      expect(photosOnly.length).toBe(1);
      expect(photosOnly[0].name).toBe('beach.jpg');

      // 5. Browse by category filter
      const financial = await filemom.browseFiles({ category: 'financial' });
      expect(financial.length).toBe(1);
      expect(financial[0].aiDescription).toBe('Invoice from Amazon for electronics');
      expect(financial[0].aiSensitive).toBe(true);

      // 6. Browse with FTS query + filter (search by filename — .txt content isn't extracted)
      const searchInDocs = await filemom.browseFiles({ q: 'report', folders: [docsDir] });
      expect(searchInDocs.length).toBe(1);
      expect(searchInDocs[0].name).toBe('report.txt');
      expect(searchInDocs[0].score).not.toBeNull();

      // 7. Filter options
      const filterOpts = await filemom.getFilterOptions();
      expect(filterOpts.categories.length).toBeGreaterThanOrEqual(1);
      expect(filterOpts.categories[0].value).toBe('financial');

      // 8. Folders
      const folders = await filemom.getFolders();
      expect(folders.length).toBeGreaterThanOrEqual(2);

      // 9. Move file
      const destPath = join(photosDir, 'invoice.pdf');
      const moveResult = await filemom.moveFile(join(docsDir, 'invoice.pdf'), destPath);
      expect(moveResult.success).toBe(true);

      // Verify index updated
      const movedFile = await filemom.getFile(destPath);
      expect(movedFile).not.toBeNull();
      expect(movedFile!.aiDescription).toBe('Invoice from Amazon for electronics');
      const oldFile = await filemom.getFile(join(docsDir, 'invoice.pdf'));
      expect(oldFile).toBeNull();

      // 10. Export descriptions
      const exported = await filemom.exportDescriptions();
      expect(exported.length).toBe(1);
      expect(exported[0].aiDescription).toBe('Invoice from Amazon for electronics');
    } finally {
      await filemom.shutdown();
    }
  });
});
