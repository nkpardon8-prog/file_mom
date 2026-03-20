import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Browser } from '../src/pages/Browser';

vi.mock('../src/lib/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', version: '0.1.0' }),
  fetchStats: vi.fn().mockResolvedValue({
    totalFiles: 100, totalSize: 5000,
    byExtension: { pdf: 50, txt: 30 },
    oldestFile: '2024-01-01T00:00:00.000Z', newestFile: '2026-03-20T00:00:00.000Z',
    lastScanAt: '2026-03-20T11:00:00.000Z', watchedFolders: [],
  }),
  fetchFolders: vi.fn().mockResolvedValue([
    { path: '/docs', fileCount: 10 },
    { path: '/photos', fileCount: 5 },
  ]),
  fetchBrowseResults: vi.fn().mockResolvedValue([
    { id: 1, path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf', size: 12345, mtime: 1710800000000, aiDescription: 'Quarterly revenue report', aiCategory: 'financial', aiSubcategory: 'report', aiTags: '["revenue"]', aiContentType: 'document', aiConfidence: 0.95, aiSensitive: false, snippet: null, score: null },
    { id: 2, path: '/docs/notes.txt', name: 'notes.txt', extension: 'txt', size: 567, mtime: 1710900000000, aiDescription: null, aiCategory: null, aiSubcategory: null, aiTags: null, aiContentType: null, aiConfidence: null, aiSensitive: false, snippet: null, score: null },
  ]),
  fetchFilterOptions: vi.fn().mockResolvedValue({
    categories: [{ value: 'financial', count: 5 }],
    contentTypes: [{ value: 'document', count: 8 }],
    sources: [], dateContexts: [],
  }),
  fetchSettings: vi.fn().mockResolvedValue({ enableEmbeddings: false, hasApiKey: true, configPath: '/test' }),
  fetchWatcherStatus: vi.fn().mockResolvedValue({ watching: false, clients: 0 }),
  fetchDescribeStatus: vi.fn().mockResolvedValue({ undescribedCount: 0, enableAIDescriptions: false }),
  fetchDescribeCost: vi.fn().mockResolvedValue({ cost: 0 }),
  triggerDescribeBatch: vi.fn(),
  triggerDescribeFile: vi.fn(),
  moveFile: vi.fn(),
  copyFile: vi.fn(),
  renameFile: vi.fn(),
  deleteFile: vi.fn(),
  smartFolderAsk: vi.fn(),
  smartFolderPreview: vi.fn(),
  smartFolderCreate: vi.fn(),
  ApiError: class extends Error {
    constructor(message: string, public status: number, public code?: string) { super(message); }
  },
}));

function renderBrowser() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Browser />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Browser Page', () => {
  it('renders folder tree panel', async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText('Folders')).toBeInTheDocument();
      expect(screen.getByText('All Files')).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText('All Files')).toBeInTheDocument();
    });
  });

  it('displays file list from browse results', async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByText('notes.txt')).toBeInTheDocument();
    });
  });

  it('shows AI description in results', async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText('Quarterly revenue report')).toBeInTheDocument();
    });
  });

  it('shows category badge in results', async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText('financial')).toBeInTheDocument();
    });
  });

  it('renders Smart Folder button', async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText('Smart Folder')).toBeInTheDocument();
    });
  });
});
