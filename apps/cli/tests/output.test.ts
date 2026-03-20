import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatSize, printScanResult, printSearchResults, printActionPlan, printStats, printCost } from '../src/utils/output.js';
import type { ScanResult, SearchResult, ActionPlan, IndexStats } from '@filemom/engine';

let logOutput: string[];

beforeEach(() => {
  logOutput = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logOutput.push(args.map(String).join(' '));
  });
});

function allOutput(): string {
  return logOutput.join('\n');
}

// ============================================================
// formatSize
// ============================================================

describe('formatSize', () => {
  it('formats zero bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(5242880)).toBe('5.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatSize(2147483648)).toBe('2.00 GB');
  });
});

// ============================================================
// printScanResult
// ============================================================

describe('printScanResult', () => {
  it('prints scan summary with counts and duration', () => {
    const result: ScanResult = {
      totalFiles: 10,
      newFiles: 3,
      updatedFiles: 2,
      deletedFiles: 1,
      errors: [],
      durationMs: 1234,
    };
    printScanResult(result);
    const output = allOutput();
    expect(output).toContain('10');
    expect(output).toContain('3');
    expect(output).toContain('2');
    expect(output).toContain('1');
    expect(output).toContain('1.23');
  });

  it('prints errors truncated to 10', () => {
    const errors = Array.from({ length: 12 }, (_, i) => ({
      path: `/file${i}.txt`,
      error: `Error ${i}`,
    }));
    printScanResult({
      totalFiles: 12, newFiles: 0, updatedFiles: 0, deletedFiles: 0,
      errors, durationMs: 100,
    });
    const output = allOutput();
    expect(output).toContain('file0.txt');
    expect(output).toContain('file9.txt');
    expect(output).toContain('and 2 more');
  });

  it('does not print errors section when no errors', () => {
    printScanResult({
      totalFiles: 5, newFiles: 5, updatedFiles: 0, deletedFiles: 0,
      errors: [], durationMs: 100,
    });
    const output = allOutput();
    expect(output).not.toContain('Errors');
  });
});

// ============================================================
// printSearchResults
// ============================================================

describe('printSearchResults', () => {
  it('prints no-results message for empty array', () => {
    printSearchResults([]);
    expect(allOutput()).toContain('No results found');
  });

  it('prints results table with file names', () => {
    const results: SearchResult[] = [
      { id: 1, path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf', size: 1024, mtime: Date.now(), score: -5.2, snippet: null },
      { id: 2, path: '/docs/invoice.pdf', name: 'invoice.pdf', extension: 'pdf', size: 2048, mtime: Date.now(), score: -3.1, snippet: null },
    ];
    printSearchResults(results);
    const output = allOutput();
    expect(output).toContain('Found 2 result(s)');
    expect(output).toContain('report.pdf');
    expect(output).toContain('invoice.pdf');
  });
});

// ============================================================
// printActionPlan
// ============================================================

describe('printActionPlan', () => {
  it('prints plan with actions, warnings, and review items', () => {
    const plan: ActionPlan = {
      intent: 'Organize photos',
      actions: [{
        id: 'act-1', type: 'move_file',
        source: '/photos/img.jpg', destination: '/photos/2024/img.jpg',
        reason: 'Sort by year', confidence: 0.92,
      }],
      needsReview: ['act-2'],
      summary: { filesAffected: 1, foldersCreated: 1, totalSizeBytes: 4096 },
      warnings: ['Some files may be duplicates'],
    };
    printActionPlan(plan);
    const output = allOutput();
    expect(output).toContain('Organize photos');
    expect(output).toContain('move_file');
    expect(output).toContain('Warnings');
    expect(output).toContain('Needs review');
  });

  it('prints message for empty plan', () => {
    const plan: ActionPlan = {
      intent: 'Nothing to do',
      actions: [],
      needsReview: [],
      summary: { filesAffected: 0, foldersCreated: 0, totalSizeBytes: 0 },
      warnings: [],
    };
    printActionPlan(plan);
    expect(allOutput()).toContain('No actions in this plan');
  });
});

// ============================================================
// printStats
// ============================================================

describe('printStats', () => {
  it('prints full index statistics', () => {
    const stats: IndexStats = {
      totalFiles: 1000,
      totalSize: 5368709120,
      byExtension: { pdf: 200, jpg: 500, txt: 300 },
      oldestFile: new Date('2020-01-01'),
      newestFile: new Date('2024-12-01'),
      lastScanAt: new Date('2024-12-15'),
      watchedFolders: [
        { path: '/Users/test/Documents', fileCount: 1000, lastScanAt: new Date('2024-12-15') },
      ],
    };
    printStats(stats);
    const output = allOutput();
    expect(output).toContain('Index Statistics');
    expect(output).toContain('1000');
    expect(output).toContain('.pdf');
    expect(output).toContain('/Users/test/Documents');
  });
});

// ============================================================
// printCost
// ============================================================

describe('printCost', () => {
  it('prints cost formatted as dollars', () => {
    printCost(0.0042);
    expect(allOutput()).toContain('$0.0042');
  });
});
