import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHealth, fetchStats, triggerScan, fetchSearchResults, ApiError } from '../src/lib/api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function ok(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve({ data }) };
}

function fail(error: string, status: number, code?: string) {
  return { ok: false, status, json: () => Promise.resolve({ error, code }) };
}

beforeEach(() => mockFetch.mockReset());

describe('fetchHealth', () => {
  it('returns health data', async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: 'ok', version: '0.1.0' }));
    const result = await fetchHealth();
    expect(result).toEqual({ status: 'ok', version: '0.1.0' });
  });

  it('throws ApiError on failure', async () => {
    mockFetch.mockResolvedValueOnce(fail('Internal server error', 500));
    await expect(fetchHealth()).rejects.toThrow(ApiError);
  });
});

describe('fetchStats', () => {
  it('returns stats with string dates', async () => {
    mockFetch.mockResolvedValueOnce(ok({
      totalFiles: 42, totalSize: 1024000,
      byExtension: { pdf: 10 },
      oldestFile: '2024-01-15T00:00:00.000Z', newestFile: '2026-03-19T00:00:00.000Z',
      lastScanAt: '2026-03-19T11:00:00.000Z',
      watchedFolders: [{ path: '/docs', fileCount: 42, lastScanAt: '2026-03-19T11:00:00.000Z' }],
    }));
    const result = await fetchStats();
    expect(result.totalFiles).toBe(42);
    expect(typeof result.oldestFile).toBe('string');
    expect(result.watchedFolders).toHaveLength(1);
  });
});

describe('triggerScan', () => {
  it('sends POST with empty body for default scan', async () => {
    mockFetch.mockResolvedValueOnce(ok({ totalFiles: 100, newFiles: 10, updatedFiles: 5, deletedFiles: 0, errors: [], durationMs: 3500 }));
    const result = await triggerScan();
    expect(result.totalFiles).toBe(100);
    expect(mockFetch).toHaveBeenCalledWith('/api/scan', expect.objectContaining({ method: 'POST', body: '{}' }));
  });

  it('sends fullRescan flag', async () => {
    mockFetch.mockResolvedValueOnce(ok({ totalFiles: 50, newFiles: 50, updatedFiles: 0, deletedFiles: 0, errors: [], durationMs: 8000 }));
    await triggerScan({ fullRescan: true });
    expect(mockFetch).toHaveBeenCalledWith('/api/scan', expect.objectContaining({ body: JSON.stringify({ fullRescan: true }) }));
  });

  it('propagates error with code', async () => {
    mockFetch.mockResolvedValueOnce(fail('Scan error', 400, 'SCAN_ERROR'));
    try {
      await triggerScan();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('SCAN_ERROR');
      expect((err as ApiError).status).toBe(400);
    }
  });
});

describe('fetchSearchResults', () => {
  it('builds correct query string', async () => {
    mockFetch.mockResolvedValueOnce(ok([]));
    await fetchSearchResults({ q: 'tax docs', limit: 5, ext: 'pdf' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('q=tax');
    expect(url).toContain('limit=5');
    expect(url).toContain('ext=pdf');
  });

  it('returns results array', async () => {
    mockFetch.mockResolvedValueOnce(ok([
      { id: 1, path: '/tax.pdf', name: 'tax.pdf', extension: 'pdf', size: 1024, mtime: 1710800000, score: 0.95, snippet: 'tax form' },
    ]));
    const data = await fetchSearchResults({ q: 'tax' });
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('tax.pdf');
  });
});
