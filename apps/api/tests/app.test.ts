import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FileMom } from '@filemom/engine';
import type { FileMomConfig } from '@filemom/engine';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

let tempDir: string;
let filesDir: string;
let dataDir: string;
let fm: FileMom;
let app: FastifyInstance;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'filemom-api-'));
  filesDir = join(tempDir, 'files');
  dataDir = join(tempDir, 'data');
  await mkdir(filesDir, { recursive: true });

  // Create test files
  await writeFile(join(filesDir, 'report.txt'), 'quarterly revenue report Q4 2024');
  await writeFile(join(filesDir, 'notes.txt'), 'meeting notes from tuesday standup');
  await writeFile(join(filesDir, 'photo.jpg'), 'fake image data');

  fm = new FileMom({
    dataDir,
    watchedFolders: [filesDir],
    openRouterApiKey: 'test-key',
  } as FileMomConfig);
  await fm.initialize();

  app = await buildApp(fm, { logger: false });
});

afterAll(async () => {
  await app.close();
  await fm.shutdown();
  await rm(tempDir, { recursive: true, force: true });
});

describe('API Server', () => {
  // ============================================================
  // Health
  // ============================================================

  it('GET /api/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('ok');
    expect(body.data.version).toBe('0.1.0');
  });

  // ============================================================
  // Stats (before scan)
  // ============================================================

  it('GET /api/stats returns empty stats before scan', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalFiles).toBe(0);
    expect(body.data.totalSize).toBe(0);
  });

  // ============================================================
  // Scan
  // ============================================================

  it('POST /api/scan indexes files', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/scan' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalFiles).toBe(3);
    expect(body.data.newFiles).toBe(3);
    expect(body.data.durationMs).toBeGreaterThan(0);
  });

  it('POST /api/scan with fullRescan reprocesses all files', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scan',
      payload: { fullRescan: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalFiles).toBe(3);
    expect(body.data.newFiles).toBe(3);
  });

  it('POST /api/scan detects deleted files', async () => {
    await rm(join(filesDir, 'photo.jpg'));

    const res = await app.inject({ method: 'POST', url: '/api/scan' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.deletedFiles).toBe(1);

    // Restore for subsequent tests
    await writeFile(join(filesDir, 'photo.jpg'), 'fake image data');
    await app.inject({ method: 'POST', url: '/api/scan' });
  });

  // ============================================================
  // Stats (after scan)
  // ============================================================

  it('GET /api/stats reflects scanned files', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalFiles).toBe(3);
    expect(body.data.totalSize).toBeGreaterThan(0);
    expect(body.data.watchedFolders).toHaveLength(1);
    expect(body.data.watchedFolders[0].fileCount).toBe(3);
  });

  // ============================================================
  // Search
  // ============================================================

  it('GET /api/search?q=report finds matching file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=report' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].name).toBe('report.txt');
  });

  it('GET /api/search?q= returns empty array for empty query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
  });

  it('GET /api/search respects limit', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=txt&limit=1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeLessThanOrEqual(1);
  });

  it('GET /api/search filters by extension', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=report&ext=txt' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    for (const result of body.data) {
      expect(result.extension).toBe('txt');
    }
  });

  // ============================================================
  // Files
  // ============================================================

  it('GET /api/files?path= returns file record', async () => {
    const filePath = join(filesDir, 'report.txt');
    const res = await app.inject({ method: 'GET', url: `/api/files?path=${encodeURIComponent(filePath)}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('report.txt');
    expect(body.data.quickHash).toMatch(/^[0-9a-f]{16}-/);
  });

  it('GET /api/files?path= returns 404 for nonexistent file', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/files?path=${encodeURIComponent('/nonexistent/path.txt')}` });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('not found');
  });

  it('GET /api/files without path returns 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Missing');
  });

  // ============================================================
  // Plan (validation only — AI call requires real API key)
  // ============================================================

  it('POST /api/plan returns 400 for empty command', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/plan', payload: { command: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/plan returns 400 for missing command', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/plan', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/plan/refine returns 400 for missing fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/plan/refine', payload: { feedback: 'test' } });
    expect(res.statusCode).toBe(400);
  });

  // ============================================================
  // Execute (validation only)
  // ============================================================

  it('POST /api/execute returns 400 for missing plan', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/execute', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  // ============================================================
  // Undo
  // ============================================================

  it('GET /api/undo/batches returns empty array initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/undo/batches' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
  });

  it('POST /api/undo returns 400 for missing batchId', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/undo', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  // ============================================================
  // Enrich & Embed
  // ============================================================

  it('GET /api/enrich/status returns counts and flags', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/enrich/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.data.unenrichedCount).toBe('number');
    expect(typeof body.data.unembeddedCount).toBe('number');
    expect(typeof body.data.enableVisionEnrichment).toBe('boolean');
    expect(typeof body.data.enableEmbeddings).toBe('boolean');
  });

  it('POST /api/enrich/file returns 400 for missing path', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/enrich/file', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Missing');
  });

  // ============================================================
  // Settings (expanded)
  // ============================================================

  it('GET /api/settings returns config shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.data.hasApiKey).toBe('boolean');
    expect(body.data.configPath).toContain('.filemom');
  });

  it('PUT /api/settings updates model', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { model: 'test-model' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.saved).toBe(true);
  });

  it('PUT /api/settings updates boolean fields', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { includeHidden: true } });
    expect(res.statusCode).toBe(200);
  });

  it('PUT /api/settings rejects invalid types', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { includeHidden: 'not-a-bool' } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/settings/folders validates path', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/settings/folders', payload: { path: '/nonexistent/xyz' } });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('does not exist');
  });

  it('DELETE /api/settings/folders returns 400 for missing path', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/settings/folders', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/settings/test-key returns result', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/settings/test-key', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(typeof JSON.parse(res.body).data.valid).toBe('boolean');
  });

  // ============================================================
  // Watcher
  // ============================================================

  it('GET /api/watch/status returns watching state', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/watch/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.data.watching).toBe('boolean');
    expect(typeof body.data.clients).toBe('number');
  });

  it('POST /api/watch/start starts watcher', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/watch/start' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.watching).toBe(true);

    // Verify status
    const status = await app.inject({ method: 'GET', url: '/api/watch/status' });
    expect(JSON.parse(status.body).data.watching).toBe(true);

    // Stop for cleanup
    await app.inject({ method: 'POST', url: '/api/watch/stop' });
  });

  it('POST /api/watch/stop stops watcher', async () => {
    await app.inject({ method: 'POST', url: '/api/watch/start' });
    const res = await app.inject({ method: 'POST', url: '/api/watch/stop' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.watching).toBe(false);
  });
});
