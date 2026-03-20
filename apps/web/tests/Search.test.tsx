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
  fetchSearchResults: vi.fn(),
  fetchFile: vi.fn(),
  fetchSettings: vi.fn().mockResolvedValue({ enableEmbeddings: false, hasApiKey: true, configPath: '/test' }),
  ApiError: class extends Error {
    constructor(message: string, public status: number, public code?: string) { super(message); }
  },
}));

import { fetchSearchResults, fetchFile } from '../src/lib/api';
const mockSearch = vi.mocked(fetchSearchResults);
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

const mockResults = [
  { id: 1, path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf', size: 12345, mtime: 1710800000000, score: -3.5, snippet: 'quarterly revenue report' },
  { id: 2, path: '/docs/notes.txt', name: 'notes.txt', extension: 'txt', size: 567, mtime: 1710900000000, score: -2.1, snippet: 'meeting notes' },
];

describe('Search Page', () => {
  it('shows initial state with search prompt', () => {
    renderSearch();
    expect(screen.getByText('Enter a search query to find files')).toBeInTheDocument();
  });

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

  it('displays results after search', async () => {
    mockSearch.mockResolvedValue(mockResults);
    renderSearch();

    const input = screen.getByPlaceholderText('Search files...');
    fireEvent.change(input, { target: { value: 'report' } });

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByText('notes.txt')).toBeInTheDocument();
    });

    expect(screen.getByText('2 results')).toBeInTheDocument();
  });

  it('shows empty state for no results', async () => {
    mockSearch.mockResolvedValue([]);
    renderSearch();

    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText(/No results found/)).toBeInTheDocument();
    });
  });

  it('shows error on search failure', async () => {
    mockSearch.mockRejectedValue(new Error('Search failed'));
    renderSearch();

    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'broken' } });

    await waitFor(() => {
      expect(screen.getByText(/Search failed/)).toBeInTheDocument();
    });
  });

  it('clears search with X button', async () => {
    mockSearch.mockResolvedValue(mockResults);
    renderSearch();

    const input = screen.getByPlaceholderText('Search files...');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
    });

    // Click clear
    const clearButtons = screen.getAllByRole('button');
    const clearButton = clearButtons.find((b) => b.querySelector('.lucide-x'));
    if (clearButton) fireEvent.click(clearButton);

    await waitFor(() => {
      expect(screen.getByText('Enter a search query to find files')).toBeInTheDocument();
    });
  });

  it('opens file detail panel on row click', async () => {
    mockSearch.mockResolvedValue(mockResults);
    mockFetchFile.mockResolvedValue({
      id: 1, path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf',
      size: 12345, mtime: 1710800000000, ctime: 1710800000000,
      quickHash: 'abc123def456-12345', extractedText: 'quarterly report content',
      exifJson: null, detectedMimeType: 'application/pdf', indexedAt: 1710800000000,
      embeddingId: null, visionDescription: null, visionCategory: null,
      visionTags: null, enrichedAt: null,
    });

    renderSearch();

    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'report' } });

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
    });

    // Click the result row
    fireEvent.click(screen.getByText('report.pdf'));

    await waitFor(() => {
      expect(screen.getByText('Metadata')).toBeInTheDocument();
      expect(screen.getByText('abc123def456-12345')).toBeInTheDocument();
    });
  });

  it('shows snippet below file name', async () => {
    mockSearch.mockResolvedValue(mockResults);
    renderSearch();

    fireEvent.change(screen.getByPlaceholderText('Search files...'), { target: { value: 'report' } });

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
});
