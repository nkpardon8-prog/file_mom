import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Enrich } from '../src/pages/Enrich';

vi.mock('../src/lib/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', version: '0.1.0' }),
  fetchEnrichStatus: vi.fn(),
  triggerEnrichBatch: vi.fn(),
  triggerEnrichFile: vi.fn(),
  triggerEmbed: vi.fn(),
  ApiError: class extends Error { constructor(m: string, public status: number) { super(m); } },
}));

import { fetchEnrichStatus, triggerEnrichBatch, triggerEmbed } from '../src/lib/api';
const mockStatus = vi.mocked(fetchEnrichStatus);
const mockEnrich = vi.mocked(triggerEnrichBatch);
const mockEmbed = vi.mocked(triggerEmbed);

function renderEnrich() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><Enrich /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe('Enrich Page', () => {
  it('shows loading skeletons', () => {
    mockStatus.mockImplementation(() => new Promise(() => {}));
    renderEnrich();
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows disabled banner when vision not enabled', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 0, unembeddedCount: 0, enableVisionEnrichment: false, enableEmbeddings: true });
    renderEnrich();
    await waitFor(() => expect(screen.getByText('Vision Enrichment is not enabled')).toBeInTheDocument());
  });

  it('shows disabled banner when embeddings not enabled', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 0, unembeddedCount: 0, enableVisionEnrichment: true, enableEmbeddings: false });
    renderEnrich();
    await waitFor(() => expect(screen.getByText('Embeddings is not enabled')).toBeInTheDocument());
  });

  it('shows counts when features enabled', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 42, unembeddedCount: 100, enableVisionEnrichment: true, enableEmbeddings: true });
    renderEnrich();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });

  it('shows enrich batch button when files need enrichment', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 10, unembeddedCount: 0, enableVisionEnrichment: true, enableEmbeddings: true });
    renderEnrich();
    await waitFor(() => {
      const btn = screen.getByText('Enrich Batch').closest('button');
      expect(btn).not.toBeDisabled();
    });
  });

  it('disables enrich button when count is 0', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 0, unembeddedCount: 5, enableVisionEnrichment: true, enableEmbeddings: true });
    renderEnrich();
    await waitFor(() => expect(screen.getByText('Enrich Batch').closest('button')).toBeDisabled());
  });

  it('shows embed button when files need embeddings', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 0, unembeddedCount: 15, enableVisionEnrichment: true, enableEmbeddings: true });
    renderEnrich();
    await waitFor(() => {
      const btn = screen.getByText('Generate Embeddings').closest('button');
      expect(btn).not.toBeDisabled();
    });
  });

  it('disables embed button when count is 0', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 5, unembeddedCount: 0, enableVisionEnrichment: true, enableEmbeddings: true });
    renderEnrich();
    await waitFor(() => expect(screen.getByText('Generate Embeddings').closest('button')).toBeDisabled());
  });

  it('shows cost warning in vision section', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 5, unembeddedCount: 0, enableVisionEnrichment: true, enableEmbeddings: true });
    renderEnrich();
    await waitFor(() => expect(screen.getByText(/incurs costs/)).toBeInTheDocument());
  });

  it('shows free callout in embeddings section', async () => {
    mockStatus.mockResolvedValue({ unenrichedCount: 0, unembeddedCount: 5, enableVisionEnrichment: true, enableEmbeddings: true });
    renderEnrich();
    await waitFor(() => expect(screen.getByText(/no API cost/i)).toBeInTheDocument());
  });
});
