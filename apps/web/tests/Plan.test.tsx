import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Plan } from '../src/pages/Plan';

vi.mock('../src/lib/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', version: '0.1.0' }),
  fetchStats: vi.fn().mockResolvedValue({ totalFiles: 10, totalSize: 5000, byExtension: {}, oldestFile: '2026-01-01', newestFile: '2026-03-19', lastScanAt: null, watchedFolders: [] }),
  generatePlan: vi.fn(),
  refinePlan: vi.fn(),
  executePlan: vi.fn(),
  fetchUndoBatches: vi.fn().mockResolvedValue([]),
  ApiError: class extends Error { constructor(m: string, public status: number) { super(m); } },
}));

import { generatePlan, executePlan } from '../src/lib/api';
const mockGenerate = vi.mocked(generatePlan);
const mockExecute = vi.mocked(executePlan);

function renderPlan() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><Plan /></MemoryRouter></QueryClientProvider>,
  );
}

const fakePlan = {
  plan: {
    intent: 'Organize files by type',
    actions: [
      { id: 'a1', type: 'create_folder' as const, source: '/test', destination: '/test/Documents', reason: 'Group documents', confidence: 0.95 },
      { id: 'a2', type: 'move_file' as const, source: '/test/report.txt', destination: '/test/Documents/report.txt', reason: 'Text document', confidence: 0.9 },
      { id: 'a3', type: 'move_file' as const, source: '/test/unknown.dat', destination: '/test/Other/unknown.dat', reason: 'Unclear type', confidence: 0.3 },
    ],
    needsReview: ['a3'],
    summary: { filesAffected: 2, foldersCreated: 1, totalSizeBytes: 5000 },
    warnings: ['Some files may be misclassified'],
  },
  expansion: { keywords: ['document', 'file'], folderPatterns: [], extensions: ['txt', 'pdf'], reasoning: 'Looking for files to organize' },
  cost: 0.0324,
};

beforeEach(() => vi.clearAllMocks());

describe('Plan Page', () => {
  it('renders idle state with textarea and generate button', () => {
    renderPlan();
    expect(screen.getByPlaceholderText(/Sort my photos/)).toBeInTheDocument();
    expect(screen.getByText('Generate Plan')).toBeInTheDocument();
  });

  it('generate button is disabled when command is empty', () => {
    renderPlan();
    expect(screen.getByText('Generate Plan').closest('button')).toBeDisabled();
  });

  it('shows plan after generation', async () => {
    mockGenerate.mockResolvedValue(fakePlan);
    renderPlan();

    fireEvent.change(screen.getByPlaceholderText(/Sort my photos/), { target: { value: 'organize by type' } });
    fireEvent.click(screen.getByText('Generate Plan'));

    await waitFor(() => {
      expect(screen.getByText('Organize files by type')).toBeInTheDocument();
    });

    expect(screen.getByText('2 files affected')).toBeInTheDocument();
    expect(screen.getByText(/\$0\.03/)).toBeInTheDocument();
    expect(screen.getByText('3 actions')).toBeInTheDocument();
  });

  it('shows confidence bars with correct labels', async () => {
    mockGenerate.mockResolvedValue(fakePlan);
    renderPlan();

    fireEvent.change(screen.getByPlaceholderText(/Sort my photos/), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Generate Plan'));

    await waitFor(() => {
      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.getByText('30%')).toBeInTheDocument();
    });
  });

  it('shows needs-review badge on low-confidence actions', async () => {
    mockGenerate.mockResolvedValue(fakePlan);
    renderPlan();

    fireEvent.change(screen.getByPlaceholderText(/Sort my photos/), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Generate Plan'));

    await waitFor(() => {
      expect(screen.getByText('Review')).toBeInTheDocument();
    });
  });

  it('shows warnings', async () => {
    mockGenerate.mockResolvedValue(fakePlan);
    renderPlan();

    fireEvent.change(screen.getByPlaceholderText(/Sort my photos/), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Generate Plan'));

    await waitFor(() => {
      expect(screen.getByText('Some files may be misclassified')).toBeInTheDocument();
    });
  });

  it('returns to idle on generation failure', async () => {
    mockGenerate.mockRejectedValue(new Error('API rate limited'));
    renderPlan();

    fireEvent.change(screen.getByPlaceholderText(/Sort my photos/), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Generate Plan'));

    // After error, should return to idle state (Generate Plan button visible again)
    await waitFor(() => {
      expect(screen.getByText('Generate Plan')).toBeInTheDocument();
    });
  });

  it('shows execution results after approve', async () => {
    mockGenerate.mockResolvedValue(fakePlan);
    mockExecute.mockResolvedValue({
      batchId: 'batch-abc-123',
      success: true,
      results: [
        { actionId: 'a1', success: true, error: null, transactionId: 1 },
        { actionId: 'a2', success: true, error: null, transactionId: 2 },
      ],
      summary: { succeeded: 2, failed: 0, skipped: 0 },
    });

    renderPlan();

    fireEvent.change(screen.getByPlaceholderText(/Sort my photos/), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Generate Plan'));

    await waitFor(() => expect(screen.getByText('Approve & Execute')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Approve & Execute'));
    fireEvent.click(screen.getByText('Execute'));

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // succeeded count
      expect(screen.getByText(/Undo available/)).toBeInTheDocument();
      expect(screen.getByText(/batch-abc-123/)).toBeInTheDocument();
    });
  });

  it('cancel returns to idle', async () => {
    mockGenerate.mockResolvedValue(fakePlan);
    renderPlan();

    fireEvent.change(screen.getByPlaceholderText(/Sort my photos/), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Generate Plan'));

    await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByText('Generate Plan')).toBeInTheDocument();
  });
});
