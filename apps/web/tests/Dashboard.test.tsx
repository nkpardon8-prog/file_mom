import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Dashboard } from '../src/pages/Dashboard';

vi.mock('../src/lib/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', version: '0.1.0' }),
  fetchStats: vi.fn(),
  triggerScan: vi.fn(),
  fetchWatcherStatus: vi.fn().mockResolvedValue({ watching: false, clients: 0 }),
  ApiError: class extends Error {
    constructor(message: string, public status: number, public code?: string) { super(message); }
  },
}));

import { fetchStats } from '../src/lib/api';
const mockFetchStats = vi.mocked(fetchStats);

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Dashboard', () => {
  it('shows loading skeletons while fetching', () => {
    mockFetchStats.mockImplementation(() => new Promise(() => {}));
    renderDashboard();
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders stats when data loads', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalFiles: 1234, totalSize: 5368709120,
      byExtension: { pdf: 500, txt: 300, jpg: 200 },
      oldestFile: '2024-01-15T00:00:00.000Z', newestFile: '2026-03-19T00:00:00.000Z',
      lastScanAt: '2026-03-19T11:00:00.000Z',
      watchedFolders: [{ path: '/Users/test/Documents', fileCount: 1234, lastScanAt: '2026-03-19T11:00:00.000Z' }],
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByText('1,234')).toBeInTheDocument());
    expect(screen.getByText('5.00 GB')).toBeInTheDocument();
    expect(screen.getByText('.pdf')).toBeInTheDocument();
    expect(screen.getByText('/Users/test/Documents')).toBeInTheDocument();
  });

  it('shows empty state when no files indexed', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalFiles: 0, totalSize: 0, byExtension: {},
      oldestFile: '1970-01-01T00:00:00.000Z', newestFile: '1970-01-01T00:00:00.000Z',
      lastScanAt: null, watchedFolders: [],
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByText('No files indexed yet')).toBeInTheDocument());
  });

  it('shows error state when API unreachable', async () => {
    mockFetchStats.mockRejectedValueOnce(new Error('fetch failed'));
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Cannot connect to API')).toBeInTheDocument());
  });

  it('renders scan buttons', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalFiles: 10, totalSize: 5000, byExtension: { txt: 10 },
      oldestFile: '2026-01-01T00:00:00.000Z', newestFile: '2026-03-19T00:00:00.000Z',
      lastScanAt: '2026-03-19T11:00:00.000Z', watchedFolders: [],
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Scan Now')).toBeInTheDocument());
    expect(screen.getByText('Full Rescan')).toBeInTheDocument();
  });
});
