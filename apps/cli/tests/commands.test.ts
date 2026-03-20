import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ============================================================
// Hoisted mocks — must be created before vi.mock factories
// ============================================================

const {
  mockInitialize, mockShutdown, mockScan, mockSearch, mockGetStats,
  mockPlan, mockRefinePlan, mockGetLastExpansion, mockGetAICost,
  mockEnrichFile, mockEnrichFiles, mockGetVisionCost,
  mockExecute, mockGetUndoableBatches, mockUndo,
  mockStartWatching, mockStopWatching,
  mockSemanticSearch, mockEmbedFiles,
  mockLoadConfig, mockReadStoredConfig, mockSaveConfig,
  mockPrompt, mockSpinner,
  mockExistsSync, mockMkdir, mockStat, mockReadFile, mockWriteFile,
} = vi.hoisted(() => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  };
  return {
    mockInitialize: vi.fn().mockResolvedValue(undefined),
    mockShutdown: vi.fn().mockResolvedValue(undefined),
    mockScan: vi.fn(),
    mockSearch: vi.fn(),
    mockGetStats: vi.fn(),
    mockPlan: vi.fn(),
    mockRefinePlan: vi.fn(),
    mockGetLastExpansion: vi.fn().mockReturnValue(null),
    mockGetAICost: vi.fn().mockReturnValue(0.005),
    mockEnrichFile: vi.fn(),
    mockEnrichFiles: vi.fn(),
    mockGetVisionCost: vi.fn().mockReturnValue(0.001),
    mockExecute: vi.fn(),
    mockGetUndoableBatches: vi.fn(),
    mockUndo: vi.fn(),
    mockStartWatching: vi.fn().mockResolvedValue(undefined),
    mockStopWatching: vi.fn().mockResolvedValue(undefined),
    mockSemanticSearch: vi.fn(),
    mockEmbedFiles: vi.fn(),
    mockLoadConfig: vi.fn(),
    mockReadStoredConfig: vi.fn(),
    mockSaveConfig: vi.fn().mockResolvedValue(undefined),
    mockPrompt: vi.fn(),
    mockSpinner: spinner,
    mockExistsSync: vi.fn(),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockStat: vi.fn(),
    mockReadFile: vi.fn(),
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
  };
});

// ============================================================
// Module mocks
// ============================================================

vi.mock('@filemom/engine', () => {
  class MockFileMom {
    initialize = mockInitialize;
    shutdown = mockShutdown;
    scan = mockScan;
    search = mockSearch;
    getStats = mockGetStats;
    plan = mockPlan;
    refinePlan = mockRefinePlan;
    getLastExpansion = mockGetLastExpansion;
    getAICost = mockGetAICost;
    enrichFile = mockEnrichFile;
    enrichFiles = mockEnrichFiles;
    getVisionCost = mockGetVisionCost;
    execute = mockExecute;
    getUndoableBatches = mockGetUndoableBatches;
    undo = mockUndo;
    startWatching = mockStartWatching;
    stopWatching = mockStopWatching;
    semanticSearch = mockSemanticSearch;
    embedFiles = mockEmbedFiles;
    isWatching = false;
  }
  return {
    FileMom: MockFileMom,
    ActionPlanSchema: { parse: (x: unknown) => x },
  };
});

vi.mock('../src/utils/config.js', () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  readStoredConfig: (...args: unknown[]) => mockReadStoredConfig(...args),
  saveConfig: (...args: unknown[]) => mockSaveConfig(...args),
  CONFIG_DIR: '/mock/.filemom',
  CONFIG_FILE: '/mock/.filemom/config.json',
}));

vi.mock('../src/utils/output.js', () => ({
  printScanResult: vi.fn(),
  printSearchResults: vi.fn(),
  printActionPlan: vi.fn(),
  printStats: vi.fn(),
  printCost: vi.fn(),
  formatSize: vi.fn((b: number) => `${b} B`),
}));

vi.mock('ora', () => ({ default: vi.fn(() => mockSpinner) }));
vi.mock('inquirer', () => ({ default: { prompt: (...args: unknown[]) => mockPrompt(...args) } }));

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

// ============================================================
// Imports (after mocks)
// ============================================================

import { printScanResult, printSearchResults, printStats } from '../src/utils/output.js';
import { registerInit } from '../src/commands/init.js';
import { registerAdd } from '../src/commands/add.js';
import { registerScan } from '../src/commands/scan.js';
import { registerSearch } from '../src/commands/search.js';
import { registerStatus } from '../src/commands/status.js';
import { registerPlan } from '../src/commands/plan.js';
import { registerExecute } from '../src/commands/execute.js';
import { registerUndo } from '../src/commands/undo.js';
import { registerWatch } from '../src/commands/watch.js';

// ============================================================
// Helpers
// ============================================================

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  return program;
}

function validConfig() {
  return {
    dataDir: '/mock/.filemom',
    watchedFolders: ['/Users/test/Documents'],
    openRouterApiKey: 'sk-or-test-key',
    model: 'anthropic/claude-sonnet-4',
  };
}

let logOutput: string[];
let errorOutput: string[];

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
  logOutput = [];
  errorOutput = [];
  mockSpinner.text = '';
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logOutput.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errorOutput.push(args.map(String).join(' '));
  });
});

// ============================================================
// init
// ============================================================

describe('init command', () => {
  it('creates directory and saves default config', async () => {
    mockExistsSync.mockReturnValue(false);

    const program = makeProgram();
    registerInit(program);
    await program.parseAsync(['node', 'filemom', 'init']);

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockSaveConfig).toHaveBeenCalledWith(expect.objectContaining({
      watchedFolders: [],
      model: 'anthropic/claude-sonnet-4',
    }));
    expect(logOutput.join('\n')).toContain('initialized');
  });

  it('warns if config already exists', async () => {
    mockExistsSync.mockReturnValue(true);

    const program = makeProgram();
    registerInit(program);
    await program.parseAsync(['node', 'filemom', 'init']);

    expect(mockSaveConfig).not.toHaveBeenCalled();
    expect(logOutput.join('\n')).toContain('already exists');
  });

  it('sets exitCode 1 on mkdir failure', async () => {
    mockMkdir.mockRejectedValue(new Error('EPERM'));

    const program = makeProgram();
    registerInit(program);
    await program.parseAsync(['node', 'filemom', 'init']);

    expect(process.exitCode).toBe(1);
    expect(errorOutput.join('\n')).toContain('Failed to initialize');
  });
});

// ============================================================
// add
// ============================================================

describe('add command', () => {
  it('adds new folder to config', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReadStoredConfig.mockResolvedValue({ watchedFolders: [] });

    const program = makeProgram();
    registerAdd(program);
    await program.parseAsync(['node', 'filemom', 'add', '/Users/test/docs']);

    expect(mockSaveConfig).toHaveBeenCalled();
    expect(logOutput.join('\n')).toContain('Added');
  });

  it('errors if folder does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const program = makeProgram();
    registerAdd(program);
    await program.parseAsync(['node', 'filemom', 'add', '/nope']);

    expect(process.exitCode).toBe(1);
    expect(errorOutput.join('\n')).toContain('does not exist');
  });

  it('errors if path is not a directory', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStat.mockResolvedValue({ isDirectory: () => false });

    const program = makeProgram();
    registerAdd(program);
    await program.parseAsync(['node', 'filemom', 'add', '/file.txt']);

    expect(process.exitCode).toBe(1);
    expect(errorOutput.join('\n')).toContain('Not a directory');
  });

  it('warns on duplicate folder', async () => {
    const absPath = '/Users/test/existing';
    mockExistsSync.mockReturnValue(true);
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReadStoredConfig.mockResolvedValue({ watchedFolders: [absPath] });

    const program = makeProgram();
    registerAdd(program);
    await program.parseAsync(['node', 'filemom', 'add', absPath]);

    expect(mockSaveConfig).not.toHaveBeenCalled();
    expect(logOutput.join('\n')).toContain('already watched');
  });
});

// ============================================================
// scan
// ============================================================

describe('scan command', () => {
  it('runs scan and prints result', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockScan.mockResolvedValue({
      totalFiles: 42, newFiles: 10, updatedFiles: 5, deletedFiles: 2,
      errors: [], durationMs: 1500,
    });

    const program = makeProgram();
    registerScan(program);
    await program.parseAsync(['node', 'filemom', 'scan']);

    expect(mockInitialize).toHaveBeenCalled();
    expect(mockScan).toHaveBeenCalled();
    expect(mockSpinner.succeed).toHaveBeenCalled();
    expect(printScanResult).toHaveBeenCalled();
    expect(mockShutdown).toHaveBeenCalled();
  });

  it('errors when no watched folders', async () => {
    mockLoadConfig.mockResolvedValue({ ...validConfig(), watchedFolders: [] });

    const program = makeProgram();
    registerScan(program);
    await program.parseAsync(['node', 'filemom', 'scan']);

    expect(process.exitCode).toBe(1);
    expect(mockSpinner.fail).toHaveBeenCalled();
  });

  it('errors when no API key', async () => {
    mockLoadConfig.mockResolvedValue({ watchedFolders: ['/docs'] });

    const program = makeProgram();
    registerScan(program);
    await program.parseAsync(['node', 'filemom', 'scan']);

    expect(process.exitCode).toBe(1);
  });
});

// ============================================================
// search
// ============================================================

describe('search command', () => {
  it('searches and prints results', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockSearch.mockResolvedValue([
      { id: 1, path: '/docs/report.pdf', name: 'report.pdf', extension: 'pdf', size: 1024, mtime: Date.now(), score: -5, snippet: null },
    ]);

    const program = makeProgram();
    registerSearch(program);
    await program.parseAsync(['node', 'filemom', 'search', 'vacation photos']);

    expect(mockSearch).toHaveBeenCalledWith('vacation photos', expect.objectContaining({ limit: 20 }));
    expect(printSearchResults).toHaveBeenCalled();
  });

  it('respects --limit and --ext options', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockSearch.mockResolvedValue([]);

    const program = makeProgram();
    registerSearch(program);
    await program.parseAsync(['node', 'filemom', 'search', 'docs', '-l', '5', '-e', 'pdf', 'txt']);

    expect(mockSearch).toHaveBeenCalledWith('docs', expect.objectContaining({
      limit: 5,
      extensions: ['pdf', 'txt'],
    }));
  });
});

// ============================================================
// status
// ============================================================

describe('status command', () => {
  it('prints stats', async () => {
    const stats = {
      totalFiles: 100, totalSize: 1024, byExtension: { pdf: 50 },
      oldestFile: new Date(), newestFile: new Date(), lastScanAt: new Date(),
      watchedFolders: [{ path: '/docs', fileCount: 100, lastScanAt: new Date() }],
    };
    mockLoadConfig.mockResolvedValue(validConfig());
    mockGetStats.mockResolvedValue(stats);

    const program = makeProgram();
    registerStatus(program);
    await program.parseAsync(['node', 'filemom', 'status']);

    expect(mockGetStats).toHaveBeenCalled();
    expect(printStats).toHaveBeenCalledWith(stats);
  });

  it('errors on missing config', async () => {
    mockLoadConfig.mockResolvedValue({ watchedFolders: [] });

    const program = makeProgram();
    registerStatus(program);
    await program.parseAsync(['node', 'filemom', 'status']);

    expect(process.exitCode).toBe(1);
  });
});

// ============================================================
// plan
// ============================================================

describe('plan command', () => {
  const fakePlan = {
    intent: 'Organize photos',
    actions: [{ id: 'a1', type: 'move_file', source: '/a', destination: '/b', reason: 'test', confidence: 0.9 }],
    needsReview: [], summary: { filesAffected: 1, foldersCreated: 0, totalSizeBytes: 0 }, warnings: [],
  };

  it('generates plan and user approves', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockPlan.mockResolvedValue(fakePlan);
    mockPrompt.mockResolvedValue({ response: 'y' });

    const program = makeProgram();
    registerPlan(program);
    await program.parseAsync(['node', 'filemom', 'plan', 'organize by type']);

    expect(mockPlan).toHaveBeenCalledWith('organize by type', expect.anything());
    expect(logOutput.join('\n')).toContain('approved');
  });

  it('saves plan with --save flag', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockPlan.mockResolvedValue(fakePlan);

    const program = makeProgram();
    registerPlan(program);
    await program.parseAsync(['node', 'filemom', 'plan', 'organize', '--save', 'plan.json']);

    expect(mockWriteFile).toHaveBeenCalledWith('plan.json', expect.stringContaining('Organize photos'), 'utf-8');
    expect(logOutput.join('\n')).toContain('saved');
    expect(mockPrompt).not.toHaveBeenCalled();
  });

  it('preview mode skips AI prompt', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockPlan.mockResolvedValue(fakePlan);

    const program = makeProgram();
    registerPlan(program);
    await program.parseAsync(['node', 'filemom', 'plan', 'organize', '--preview']);

    expect(mockPlan).toHaveBeenCalledWith('organize', expect.objectContaining({ previewOnly: true }));
    expect(mockPrompt).not.toHaveBeenCalled();
  });
});

// ============================================================
// execute
// ============================================================

describe('execute command', () => {
  const fakePlan = {
    intent: 'Sort', actions: [{ id: 'a1', type: 'move_file', source: '/a', destination: '/b', reason: 'test', confidence: 0.9 }],
    needsReview: [], summary: { filesAffected: 1, foldersCreated: 0, totalSizeBytes: 0 }, warnings: [],
  };

  it('errors when no plan file provided', async () => {
    const program = makeProgram();
    registerExecute(program);
    await program.parseAsync(['node', 'filemom', 'execute']);

    expect(process.exitCode).toBe(1);
    expect(errorOutput.join('\n')).toContain('Usage');
  });

  it('executes plan with --yes flag', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify(fakePlan));
    mockLoadConfig.mockResolvedValue(validConfig());
    mockExecute.mockResolvedValue({
      batchId: 'abc-123', success: true, results: [],
      summary: { succeeded: 1, failed: 0, skipped: 0 },
    });

    const program = makeProgram();
    registerExecute(program);
    await program.parseAsync(['node', 'filemom', 'execute', 'plan.json', '--yes']);

    expect(mockPrompt).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalled();
    expect(mockSpinner.succeed).toHaveBeenCalled();
  });

  it('dry-run mode', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify(fakePlan));
    mockLoadConfig.mockResolvedValue(validConfig());
    mockExecute.mockResolvedValue({
      batchId: 'abc', success: true, results: [],
      summary: { succeeded: 1, failed: 0, skipped: 0 },
    });

    const program = makeProgram();
    registerExecute(program);
    await program.parseAsync(['node', 'filemom', 'execute', 'plan.json', '--dry-run']);

    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dryRun: true }));
    expect(logOutput.join('\n')).toContain('Dry run');
  });
});

// ============================================================
// undo
// ============================================================

describe('undo command', () => {
  it('undoes batch by direct ID', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockPrompt.mockResolvedValue({ confirm: true });
    mockUndo.mockResolvedValue({ success: true, restored: 5, errors: [] });

    const program = makeProgram();
    registerUndo(program);
    await program.parseAsync(['node', 'filemom', 'undo', 'batch-123']);

    expect(mockUndo).toHaveBeenCalledWith('batch-123');
    expect(mockSpinner.succeed).toHaveBeenCalled();
  });

  it('lists batches when no ID given, user selects', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockGetUndoableBatches.mockResolvedValue([
      { batchId: 'batch-abc', intent: 'Sort photos', actionCount: 3, executedAt: Date.now(), expiresAt: Date.now() + 1800000, status: 'active', canUndo: true },
    ]);
    mockPrompt
      .mockResolvedValueOnce({ selected: 'batch-abc' })
      .mockResolvedValueOnce({ confirm: true });
    mockUndo.mockResolvedValue({ success: true, restored: 3, errors: [] });

    const program = makeProgram();
    registerUndo(program);
    await program.parseAsync(['node', 'filemom', 'undo']);

    expect(mockGetUndoableBatches).toHaveBeenCalled();
    expect(mockUndo).toHaveBeenCalledWith('batch-abc');
  });
});

// ============================================================
// watch
// ============================================================

describe('watch command', () => {
  it('starts watching and displays folder list', async () => {
    mockLoadConfig.mockResolvedValue(validConfig());
    mockStartWatching.mockImplementation(async () => {
      // Simulate SIGINT shortly after start to prevent hanging
      setTimeout(() => process.emit('SIGINT' as any), 50);
    });

    const program = makeProgram();
    registerWatch(program);
    await program.parseAsync(['node', 'filemom', 'watch']);

    expect(mockInitialize).toHaveBeenCalled();
    expect(mockStartWatching).toHaveBeenCalled();
    expect(mockShutdown).toHaveBeenCalled();
  });

  it('errors when no watched folders configured', async () => {
    mockLoadConfig.mockResolvedValue({ ...validConfig(), watchedFolders: [] });

    const program = makeProgram();
    registerWatch(program);
    await program.parseAsync(['node', 'filemom', 'watch']);

    expect(process.exitCode).toBe(1);
    expect(mockSpinner.fail).toHaveBeenCalled();
  });
});
