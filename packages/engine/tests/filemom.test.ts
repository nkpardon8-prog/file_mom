import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileMom } from '../src/filemom.js';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

let tempDir: string;
let filesDir: string;
let dataDir: string;
let filemom: FileMom;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'filemom-orch-'));
  filesDir = join(tempDir, 'files');
  dataDir = join(tempDir, 'data');
  await mkdir(filesDir, { recursive: true });

  filemom = new FileMom({
    dataDir,
    watchedFolders: [filesDir],
    openRouterApiKey: 'test-key',
  });
  await filemom.initialize();
});

afterEach(async () => {
  await filemom.shutdown();
  await rm(tempDir, { recursive: true, force: true });
});

describe('FileMom Orchestrator', () => {
  // ============================================================
  // Initialization
  // ============================================================

  it('creates data directory on initialize', async () => {
    const customData = join(tempDir, 'custom', 'nested', 'data');
    const fm = new FileMom({
      dataDir: customData,
      watchedFolders: [filesDir],
      openRouterApiKey: 'test-key',
    });
    await fm.initialize();

    const stats = await fm.getStats();
    expect(stats.totalFiles).toBe(0);
    await fm.shutdown();
  });

  // ============================================================
  // Scan pipeline
  // ============================================================

  it('scans and indexes files', async () => {
    await writeFile(join(filesDir, 'hello.txt'), 'hello world');
    await writeFile(join(filesDir, 'readme.md'), '# Title');
    await writeFile(join(filesDir, 'data.json'), '{"key": "value"}');

    const result = await filemom.scan();

    expect(result.totalFiles).toBe(3);
    expect(result.newFiles).toBe(3);
    expect(result.updatedFiles).toBe(0);
    expect(result.durationMs).toBeGreaterThan(0);

    const stats = await filemom.getStats();
    expect(stats.totalFiles).toBe(3);
  });

  it('extracts metadata and stores hash', async () => {
    await writeFile(join(filesDir, 'test.txt'), 'some content here');

    await filemom.scan();

    const file = await filemom.getFile(join(filesDir, 'test.txt'));
    expect(file).not.toBeNull();
    expect(file!.name).toBe('test.txt');
    expect(file!.extension).toBe('txt');
    expect(file!.quickHash).toMatch(/^[0-9a-f]{16}-\d+$/);
    expect(file!.size).toBeGreaterThan(0);
    expect(file!.indexedAt).toBeGreaterThan(0);
  });

  it('scan is incremental — skips unchanged files', async () => {
    await writeFile(join(filesDir, 'stable.txt'), 'unchanged content');

    const first = await filemom.scan();
    expect(first.newFiles).toBe(1);

    const second = await filemom.scan();
    expect(second.totalFiles).toBe(1);
    expect(second.newFiles).toBe(0);
    expect(second.updatedFiles).toBe(0);
  });

  it('scan detects updated files', async () => {
    const filePath = join(filesDir, 'changing.txt');
    await writeFile(filePath, 'version 1');

    await filemom.scan();

    // Wait a tick to ensure mtime changes
    await sleep(50);
    await writeFile(filePath, 'version 2 with more content');

    const result = await filemom.scan();
    expect(result.updatedFiles).toBe(1);
    expect(result.newFiles).toBe(0);
  });

  it('scan reports extraction errors for skipped extensions', async () => {
    await writeFile(join(filesDir, 'app.exe'), 'binary');
    await writeFile(join(filesDir, 'normal.txt'), 'text');

    // Recreate with skipExtensions configured
    await filemom.shutdown();
    filemom = new FileMom({
      dataDir,
      watchedFolders: [filesDir],
      openRouterApiKey: 'test-key',
      skipExtensions: ['exe'],
    });
    await filemom.initialize();

    const result = await filemom.scan();

    expect(result.totalFiles).toBe(2);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.error === 'Skipped extension')).toBe(true);
  });

  it('handles nested directories', async () => {
    await mkdir(join(filesDir, 'sub', 'deep'), { recursive: true });
    await writeFile(join(filesDir, 'top.txt'), 'a');
    await writeFile(join(filesDir, 'sub', 'mid.txt'), 'b');
    await writeFile(join(filesDir, 'sub', 'deep', 'bottom.txt'), 'c');

    const result = await filemom.scan();
    expect(result.totalFiles).toBe(3);
    expect(result.newFiles).toBe(3);
  });

  it('handles empty directories', async () => {
    const result = await filemom.scan();
    expect(result.totalFiles).toBe(0);
    expect(result.newFiles).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('full rescan re-processes all files', async () => {
    await writeFile(join(filesDir, 'file.txt'), 'content');

    await filemom.scan();
    const result = await filemom.scan({ fullRescan: true });

    expect(result.newFiles).toBe(1);
  });

  it('reports progress via callback', async () => {
    await writeFile(join(filesDir, 'a.txt'), 'a');
    await writeFile(join(filesDir, 'b.txt'), 'b');

    const progress: number[] = [];
    await filemom.scan({
      onProgress: (event) => {
        if (event.type === 'scan:progress') {
          progress.push(event.scanned);
        }
      },
    });

    expect(progress.length).toBeGreaterThanOrEqual(2);
  });

  // ============================================================
  // Batch processing
  // ============================================================

  it('handles large number of files with batch processing', async () => {
    for (let i = 0; i < 250; i++) {
      await writeFile(join(filesDir, `file${i}.txt`), `content ${i}`);
    }

    const result = await filemom.scan();
    expect(result.totalFiles).toBe(250);
    expect(result.newFiles).toBe(250);

    const stats = await filemom.getStats();
    expect(stats.totalFiles).toBe(250);
  });

  // ============================================================
  // Search
  // ============================================================

  it('search finds indexed files by name', async () => {
    await writeFile(join(filesDir, 'quarterly-report.txt'), 'Q4 results');
    await writeFile(join(filesDir, 'invoice.txt'), 'billing info');

    await filemom.scan();

    const results = await filemom.search('quarterly');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('quarterly-report.txt');
  });

  it('search returns empty for no matches', async () => {
    await writeFile(join(filesDir, 'test.txt'), 'hello');
    await filemom.scan();

    const results = await filemom.search('zzzznonexistent');
    expect(results).toHaveLength(0);
  });

  // ============================================================
  // getFile
  // ============================================================

  it('getFile returns null for non-indexed path', async () => {
    const result = await filemom.getFile('/nonexistent/path');
    expect(result).toBeNull();
  });

  // ============================================================
  // EXIF serialization
  // ============================================================

  it('serializes EXIF data to JSON string in record', async () => {
    // The extractor returns ExifData objects; the orchestrator should
    // serialize them to JSON strings for the indexer.
    // We test this indirectly — any image file (even fake) goes through
    // the EXIF extraction path. With a fake file, exif will be null,
    // so exifJson should also be null.
    await writeFile(join(filesDir, 'photo.jpg'), 'not a real jpeg');
    await filemom.scan();

    const file = await filemom.getFile(join(filesDir, 'photo.jpg'));
    expect(file).not.toBeNull();
    // With a fake JPEG, EXIF extraction fails gracefully → null
    expect(file!.exifJson).toBeNull();
    // But hash should still be present
    expect(file!.quickHash).toMatch(/^[0-9a-f]{16}-/);
  });

  // ============================================================
  // Lifecycle
  // ============================================================

  it('shutdown and reinitialize preserves data', async () => {
    await writeFile(join(filesDir, 'persist.txt'), 'persistent data');
    await filemom.scan();

    await filemom.shutdown();

    // Reinitialize with same dataDir
    filemom = new FileMom({
      dataDir,
      watchedFolders: [filesDir],
      openRouterApiKey: 'test-key',
    });
    await filemom.initialize();

    const file = await filemom.getFile(join(filesDir, 'persist.txt'));
    expect(file).not.toBeNull();
    expect(file!.name).toBe('persist.txt');

    const results = await filemom.search('persist');
    expect(results).toHaveLength(1);
  });

  // ============================================================
  // Deleted file detection
  // ============================================================

  it('scan detects and removes deleted files', async () => {
    await writeFile(join(filesDir, 'keep.txt'), 'keep me');
    await writeFile(join(filesDir, 'remove.txt'), 'delete me');

    const first = await filemom.scan();
    expect(first.totalFiles).toBe(2);
    expect(first.newFiles).toBe(2);

    await rm(join(filesDir, 'remove.txt'));

    const second = await filemom.scan();
    expect(second.totalFiles).toBe(1);
    expect(second.deletedFiles).toBe(1);

    const removed = await filemom.getFile(join(filesDir, 'remove.txt'));
    expect(removed).toBeNull();

    const kept = await filemom.getFile(join(filesDir, 'keep.txt'));
    expect(kept).not.toBeNull();
  });

  it('scan only deletes files from scanned folders', async () => {
    const folder1 = join(tempDir, 'folder1');
    const folder2 = join(tempDir, 'folder2');
    await mkdir(folder1, { recursive: true });
    await mkdir(folder2, { recursive: true });

    await filemom.shutdown();
    filemom = new FileMom({
      dataDir,
      watchedFolders: [folder1, folder2],
      openRouterApiKey: 'test-key',
    });
    await filemom.initialize();

    await writeFile(join(folder1, 'a.txt'), 'a');
    await writeFile(join(folder2, 'b.txt'), 'b');
    await filemom.scan();

    await rm(join(folder1, 'a.txt'));
    const result = await filemom.scan({ folders: [folder1] });

    expect(result.deletedFiles).toBe(1);

    const fileB = await filemom.getFile(join(folder2, 'b.txt'));
    expect(fileB).not.toBeNull();
  });

  it('scan deletedFiles is 0 when no files were removed', async () => {
    await writeFile(join(filesDir, 'stable.txt'), 'stable');
    await filemom.scan();

    const result = await filemom.scan();
    expect(result.deletedFiles).toBe(0);
  });

  // ============================================================
  // watchedFolders in getStats
  // ============================================================

  it('getStats populates watchedFolders with file counts', async () => {
    await writeFile(join(filesDir, 'a.txt'), 'a');
    await writeFile(join(filesDir, 'b.txt'), 'b');
    await filemom.scan();

    const stats = await filemom.getStats();
    expect(stats.watchedFolders).toHaveLength(1);
    expect(stats.watchedFolders[0].path).toBe(filesDir);
    expect(stats.watchedFolders[0].fileCount).toBe(2);
    expect(stats.watchedFolders[0].lastScanAt).toBeInstanceOf(Date);
  });

  it('getStats watchedFolders shows 0 count for empty folder', async () => {
    const stats = await filemom.getStats();
    expect(stats.watchedFolders).toHaveLength(1);
    expect(stats.watchedFolders[0].fileCount).toBe(0);
  });

  it('getStats watchedFolders with multiple folders', async () => {
    const folder2 = join(tempDir, 'folder2');
    await mkdir(folder2, { recursive: true });
    await writeFile(join(folder2, 'x.txt'), 'x');

    await filemom.shutdown();
    filemom = new FileMom({
      dataDir,
      watchedFolders: [filesDir, folder2],
      openRouterApiKey: 'test-key',
    });
    await filemom.initialize();

    await writeFile(join(filesDir, 'a.txt'), 'a');
    await filemom.scan();

    const stats = await filemom.getStats();
    expect(stats.watchedFolders).toHaveLength(2);

    const folder1Stats = stats.watchedFolders.find((f) => f.path === filesDir);
    const folder2Stats = stats.watchedFolders.find((f) => f.path === folder2);

    expect(folder1Stats!.fileCount).toBe(1);
    expect(folder2Stats!.fileCount).toBe(1);
  });

  // ============================================================
  // Watch integration
  // ============================================================

  it('startWatching detects new file and indexes it', async () => {
    await filemom.startWatching();
    await sleep(200);

    await writeFile(join(filesDir, 'watched-new.txt'), 'new content');

    await vi.waitFor(async () => {
      const file = await filemom.getFile(join(filesDir, 'watched-new.txt'));
      expect(file).not.toBeNull();
      expect(file!.name).toBe('watched-new.txt');
    }, { timeout: 5000 });

    await filemom.stopWatching();
  });

  it('startWatching detects deleted file and removes from index', async () => {
    await writeFile(join(filesDir, 'to-delete.txt'), 'delete me');
    await filemom.scan();

    await filemom.startWatching();
    await sleep(200);

    await rm(join(filesDir, 'to-delete.txt'));

    await vi.waitFor(async () => {
      const file = await filemom.getFile(join(filesDir, 'to-delete.txt'));
      expect(file).toBeNull();
    }, { timeout: 5000 });

    await filemom.stopWatching();
  });

  it('stopWatching stops event processing', async () => {
    await filemom.startWatching();
    expect(filemom.isWatching).toBe(true);

    await filemom.stopWatching();
    expect(filemom.isWatching).toBe(false);
  });

  it('shutdown stops watcher if active', async () => {
    await filemom.startWatching();
    expect(filemom.isWatching).toBe(true);

    await filemom.shutdown();
    // Reinitialize for afterEach cleanup
    filemom = new FileMom({
      dataDir,
      watchedFolders: [filesDir],
      openRouterApiKey: 'test-key',
    });
    await filemom.initialize();
  });

  it('startWatching is idempotent', async () => {
    await filemom.startWatching();
    await filemom.startWatching(); // Should not throw
    expect(filemom.isWatching).toBe(true);
    await filemom.stopWatching();
  });
});
