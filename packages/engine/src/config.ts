import { z } from 'zod';
import type { FileMomConfig } from './types.js';

/** Zod schema for validating engine configuration */
export const ConfigSchema = z.object({
  dataDir: z.string().min(1),
  watchedFolders: z.array(z.string()).min(1),
  excludePatterns: z.array(z.string()).default([]),
  includeHidden: z.boolean().default(false),
  followSymlinks: z.boolean().default(false),
  maxTextLength: z.number().int().min(100).max(100000).default(10000),
  extractionTimeoutMs: z.number().int().min(1000).max(60000).default(5000),
  skipExtensions: z.array(z.string()).default([]),
  anthropicApiKey: z.string().min(1),
  model: z
    .enum(['claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-opus-4-20250514'])
    .default('claude-sonnet-4-20250514'),
  maxFilesPerRequest: z.number().int().min(10).max(1000).default(500),
  requestTimeoutMs: z.number().int().min(5000).max(120000).default(30000),
  undoTTLMinutes: z.number().int().min(5).max(1440).default(30),
  maxConcurrentOps: z.number().int().min(1).max(50).default(20),
  retryAttempts: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().min(100).max(10000).default(1000),
  enableEmbeddings: z.boolean().default(false),
  embeddingModel: z.string().default('all-MiniLM-L6-v2'),
  lanceDbPath: z.string().optional(),
});

/** Default configuration values */
export const DEFAULT_CONFIG: Partial<FileMomConfig> = {
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.*',
    '**/*.tmp',
    '**/Thumbs.db',
    '**/.DS_Store',
  ],
  includeHidden: false,
  followSymlinks: false,
  maxTextLength: 10000,
  extractionTimeoutMs: 5000,
  skipExtensions: ['exe', 'dll', 'so', 'dylib', 'bin'],
  model: 'claude-sonnet-4-20250514',
  maxFilesPerRequest: 500,
  requestTimeoutMs: 30000,
  undoTTLMinutes: 30,
  maxConcurrentOps: 20,
  retryAttempts: 3,
  retryDelayMs: 1000,
  enableEmbeddings: false,
  embeddingModel: 'all-MiniLM-L6-v2',
};
