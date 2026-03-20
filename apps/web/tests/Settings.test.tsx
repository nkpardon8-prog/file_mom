import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Settings } from '../src/pages/Settings';

vi.mock('../src/lib/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', version: '0.1.0' }),
  fetchSettings: vi.fn(),
  fetchStats: vi.fn().mockResolvedValue({
    totalFiles: 100, totalSize: 5000, byExtension: { txt: 50 },
    oldestFile: '2024-01-01', newestFile: '2026-03-19', lastScanAt: null,
    watchedFolders: [{ path: '/Users/test/Documents', fileCount: 100, lastScanAt: null }],
  }),
  updateSettings: vi.fn(),
  addWatchedFolder: vi.fn(),
  removeWatchedFolder: vi.fn(),
  testApiKey: vi.fn(),
  ApiError: class extends Error { constructor(m: string, public status: number) { super(m); } },
}));

import { fetchSettings } from '../src/lib/api';
const mockSettings = vi.mocked(fetchSettings);

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><Settings /></MemoryRouter></QueryClientProvider>);
}

const fullSettings = {
  openRouterApiKey: 'sk-or-v1...0f0d',
  hasApiKey: true,
  configPath: '/Users/test/.filemom/config.json',
  watchedFolders: ['/Users/test/Documents'],
  model: 'anthropic/claude-sonnet-4',
  excludePatterns: ['**/node_modules/**', '**/.git/**'],
  includeHidden: false,
  followSymlinks: false,
  enableVisionEnrichment: false,
  visionModel: 'qwen/qwen-2.5-vl-7b-instruct',
  visionBatchSize: 50,
  enableEmbeddings: false,
  embeddingModel: 'all-MiniLM-L6-v2',
  embeddingDimensions: 384,
  maxFilesPerRequest: 500,
  requestTimeoutMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
  maxConcurrentOps: 20,
  undoTTLMinutes: 30,
  maxRefinementRounds: 3,
};

beforeEach(() => vi.clearAllMocks());

describe('Settings Page', () => {
  it('shows loading state', () => {
    mockSettings.mockImplementation(() => new Promise(() => {}));
    renderSettings();
    expect(document.querySelector('.animate-spin')).not.toBeNull();
  });

  it('renders all sections', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('API Key')).toBeInTheDocument();
      expect(screen.getByText('Watched Folders')).toBeInTheDocument();
      expect(screen.getByText('AI Model')).toBeInTheDocument();
      expect(screen.getByText('Scan Settings')).toBeInTheDocument();
      expect(screen.getByText('Vision Enrichment')).toBeInTheDocument();
      expect(screen.getByText('Embeddings')).toBeInTheDocument();
      expect(screen.getByText('Advanced')).toBeInTheDocument();
    });
  });

  it('shows masked API key', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => expect(screen.getByText(/sk-or-v1/)).toBeInTheDocument());
  });

  it('shows watched folders', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => expect(screen.getByText('/Users/test/Documents')).toBeInTheDocument());
  });

  it('shows current model', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => {
      const select = screen.getByDisplayValue('anthropic/claude-sonnet-4');
      expect(select).toBeInTheDocument();
    });
  });

  it('shows exclude patterns as tags', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('**/node_modules/**')).toBeInTheDocument();
      expect(screen.getByText('**/.git/**')).toBeInTheDocument();
    });
  });

  it('shows embedding model read-only', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('all-MiniLM-L6-v2')).toBeInTheDocument();
      expect(screen.getByText('384')).toBeInTheDocument();
    });
  });

  it('advanced section is collapsed by default', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => expect(screen.getByText('Advanced')).toBeInTheDocument());
    // Advanced fields should not be visible
    expect(screen.queryByText('Max files per request')).toBeNull();
  });

  it('renders test connection button', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());
  });

  it('renders add folder input', async () => {
    mockSettings.mockResolvedValue(fullSettings);
    renderSettings();
    await waitFor(() => expect(screen.getByPlaceholderText('/path/to/folder')).toBeInTheDocument());
  });
});
