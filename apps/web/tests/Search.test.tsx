import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Search } from '../src/pages/Search';

vi.mock('../src/lib/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', version: '0.1.0' }),
  fetchStats: vi.fn().mockResolvedValue({
    totalFiles: 100, totalSize: 5000,
    byExtension: { pdf: 50, txt: 30, jpg: 20 },
    oldestFile: '2024-01-01T00:00:00.000Z', newestFile: '2026-03-19T00:00:00.000Z',
    lastScanAt: '2026-03-19T11:00:00.000Z', watchedFolders: [],
  }),
  fetchBrowseResults: vi.fn().mockResolvedValue([]),
  fetchFilterOptions: vi.fn().mockResolvedValue({
    categories: [{ value: 'financial', count: 10 }],
    contentTypes: [{ value: 'document', count: 8 }],
    sources: [],
    dateContexts: [],
  }),
  fetchFile: vi.fn(),
  fetchSettings: vi.fn().mockResolvedValue({ enableEmbeddings: false, hasApiKey: true, configPath: '/test' }),
  ApiError: class extends Error {
    constructor(message: string, public status: number, public code?: string) { super(message); }
  },
}));

import { fetchBrowseResults, fetchFile } from '../src/lib/api';
const mockBrowse = vi.mocked(fetchBrowseResults);
const mockFetchFile = vi.mocked(fetchFile);

function renderSearch() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Search />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

const mockBrowseResults = [
  { id: 1, path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf', size: 12345, mtime: 1710800000000, score: -3.5, snippet: 'quarterly revenue report', aiDescription: 'Quarterly revenue report Q4', aiCategory: 'financial', aiSubcategory: 'report', aiTags: '["revenue","Q4"]', aiContentType: 'document', aiConfidence: 0.9, aiSensitive: false },
  { id: 2, path: '/docs/notes.txt', name: 'notes.txt', extension: 'txt', size: 567, mtime: 1710900000000, score: -2.1, snippet: 'meeting notes', aiDescription: 'Meeting notes from standup', aiCategory: 'work', aiSubcategory: 'notes', aiTags: '["meeting"]', aiContentType: 'document', aiConfidence: 0.85, aiSensitive: false },
];

describe('Search Page', () => {
  it('renders search input', () => {
    renderSearch();
    expect(screen.getByPlaceholderText('Search files...')).toBeInTheDocument();
  });

  it('renders extension chips from stats', async () => {
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText('.pdf')).toBeInTheDocument();
      expect(screen.getByText('.txt')).toBeInTheDocument();
      expect(screen.getByText('.jpg')).toBeInTheDocument();
    });
  });

  it('renders limit dropdown', () => {
    renderSearch();
    expect(screen.getByDisplayValue('20 results')).toBeInTheDocument();
  });

  it('renders filter dropdowns from filterOptions', async () => {
    renderSearch();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Categories')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All Types')).toBeInTheDocument();
    });
  });

  it('displays browse results', async () => {
    mockBrowse.mockResolvedValue(mockBrowseResults);
    renderSearch();

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByText('notes.txt')).toBeInTheDocument();
    });

    expect(screen.getByText('2 results')).toBeInTheDocument();
  });

  it('shows AI description and category in results', async () => {
    mockBrowse.mockResolvedValue(mockBrowseResults);
    renderSearch();

    await waitFor(() => {
      expect(screen.getByText('Quarterly revenue report Q4')).toBeInTheDocument();
      expect(screen.getByText('financial')).toBeInTheDocument();
      expect(screen.getByText('work')).toBeInTheDocument();
    });
  });

  it('shows error on browse failure', async () => {
    mockBrowse.mockRejectedValue(new Error('Search failed'));
    renderSearch();

    await waitFor(() => {
      expect(screen.getByText(/Search failed/)).toBeInTheDocument();
    });
  });

  it('opens file detail panel on row click', async () => {
    mockBrowse.mockResolvedValue(mockBrowseResults);
    mockFetchFile.mockResolvedValue({
      id: 1, path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf',
      size: 12345, mtime: 1710800000000, ctime: 1710800000000,
      quickHash: 'abc123def456-12345', extractedText: 'quarterly report content',
      exifJson: null, detectedMimeType: 'application/pdf', indexedAt: 1710800000000,
      embeddingId: null, visionDescription: null, visionCategory: null,
      visionTags: null, enrichedAt: null,
      aiDescription: null, aiCategory: null, aiSubcategory: null, aiTags: null,
      aiDateContext: null, aiSource: null, aiContentType: null, aiConfidence: null,
      aiSensitive: null, aiSensitiveType: null, aiDetails: null, aiDescribedAt: null,
      aiDescriptionModel: null,
    });

    renderSearch();

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('report.pdf'));

    await waitFor(() => {
      expect(screen.getByText('Metadata')).toBeInTheDocument();
      expect(screen.getByText('abc123def456-12345')).toBeInTheDocument();
    });
  });

  it('shows snippet below file name in results', async () => {
    mockBrowse.mockResolvedValue(mockBrowseResults);
    renderSearch();

    await waitFor(() => {
      expect(screen.getByText('quarterly revenue report')).toBeInTheDocument();
    });
  });

  it('disables semantic toggle when embeddings not enabled', async () => {
    renderSearch();
    await waitFor(() => {
      const semanticBtn = screen.getByText('Semantic');
      expect(semanticBtn).toBeDisabled();
    });
  });

  it('renders sensitive filter toggle', () => {
    renderSearch();
    expect(screen.getByText('Sensitive')).toBeInTheDocument();
  });
});
