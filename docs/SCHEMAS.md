# FileMom Schemas & Types

This document defines all data structures, database schemas, and validation schemas used in the FileMom backend.

---

## TypeScript Types

### Core File Types

```typescript
/**
 * Output from Scanner - basic file info from filesystem
 */
export interface ScannedFile {
  path: string;           // Absolute path
  name: string;           // Filename with extension
  extension: string;      // Lowercase, without dot (e.g., "pdf")
  size: number;           // Bytes
  mtime: number;          // Modified time (Unix ms)
  ctime: number;          // Created time (Unix ms)
  isSymlink: boolean;     // True if symbolic link
  isDirectory: boolean;   // True if directory (usually filtered out)
}

/**
 * Output from Extractor - adds content-based metadata
 */
export interface ExtractedMetadata {
  path: string;
  quickHash: string;              // xxHash of first 4KB + size
  extractedText: string | null;   // Text content (max 10KB)
  exif: ExifData | null;          // EXIF data for images
  extractionError: string | null; // Error message if extraction failed
  extractedAt: number;            // Unix ms timestamp
}

/**
 * EXIF data extracted from images
 */
export interface ExifData {
  dateTaken: string | null;       // ISO 8601 date
  camera: string | null;          // "Apple iPhone 14 Pro"
  lens: string | null;            // "iPhone 14 Pro back camera"
  dimensions: {
    width: number;
    height: number;
  } | null;
  gps: {
    latitude: number;
    longitude: number;
    altitude: number | null;
  } | null;
  orientation: number | null;     // EXIF orientation (1-8)
}

/**
 * Combined file record stored in database
 */
export interface FileRecord {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  ctime: number;
  quickHash: string;
  extractedText: string | null;
  exifJson: string | null;        // JSON stringified ExifData
  indexedAt: number;
  embeddingId: string | null;     // Phase 2: reference to LanceDB
}

/**
 * Simplified file info sent to Claude API
 */
export interface FileIndexEntry {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedDate: string;           // Human readable: "2024-03-15"
  summary: string | null;         // "Photo taken 2017-08-15 in Hawaii" or first 200 chars of text
}
```

### Action Plan Types

```typescript
/**
 * Single action in an action plan
 */
export interface Action {
  id: string;                     // UUID for tracking
  type: ActionType;
  source: string;                 // Absolute path (existing file/folder)
  destination: string;            // Absolute path (target location)
  reason: string;                 // Human-readable explanation
  confidence: number;             // 0.0 to 1.0
}

export type ActionType =
  | 'move_file'
  | 'rename_file'
  | 'create_folder'
  | 'copy_file';                  // Rarely used, but supported

/**
 * Complete action plan returned by AI
 */
export interface ActionPlan {
  intent: string;                 // "Organize Hawaii vacation photos by date"
  actions: Action[];
  needsReview: string[];          // Action IDs with confidence < 0.8
  summary: {
    filesAffected: number;
    foldersCreated: number;
    totalSizeBytes: number;
  };
  warnings: string[];             // "2 files have the same name"
}

/**
 * Result of executing a single action
 */
export interface ActionResult {
  actionId: string;
  success: boolean;
  error: string | null;
  transactionId: number | null;   // Reference to transaction log
}

/**
 * Result of executing an entire plan
 */
export interface ExecutionResult {
  batchId: string;                // Groups all actions in this execution
  success: boolean;               // True if ALL actions succeeded
  results: ActionResult[];
  summary: {
    succeeded: number;
    failed: number;
    skipped: number;
  };
}
```

### Transaction Types

```typescript
/**
 * Single transaction record for undo
 */
export interface TransactionRecord {
  id: number;
  batchId: string;                // Groups related operations
  actionId: string;               // Reference to original Action.id
  actionType: ActionType;
  sourcePath: string;
  destPath: string;
  executedAt: number;             // Unix ms
  status: TransactionStatus;
  expiresAt: number;              // Unix ms (30 min from execution)
  error: string | null;
}

export type TransactionStatus =
  | 'pending'                     // Logged but not yet executed
  | 'completed'                   // Successfully executed
  | 'failed'                      // Execution failed
  | 'rolled_back';                // Undone

/**
 * Summary of a batch for undo UI
 */
export interface BatchSummary {
  batchId: string;
  intent: string;                 // Original user command
  executedAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'rolled_back';
  actionCount: number;
  canUndo: boolean;
}
```

### Configuration Types

```typescript
/**
 * Full engine configuration
 */
export interface FileMomConfig {
  // Storage
  dataDir: string;

  // Scanning
  watchedFolders: string[];
  excludePatterns: string[];
  includeHidden: boolean;
  followSymlinks: boolean;

  // Extraction
  maxTextLength: number;
  extractionTimeoutMs: number;
  skipExtensions: string[];       // Extensions to skip extraction

  // AI
  anthropicApiKey: string;
  model: ClaudeModel;
  maxFilesPerRequest: number;
  requestTimeoutMs: number;

  // Execution
  undoTTLMinutes: number;
  maxConcurrentOps: number;
  retryAttempts: number;
  retryDelayMs: number;

  // Phase 2
  enableEmbeddings: boolean;
  embeddingModel: string;
  lanceDbPath: string;
}

export type ClaudeModel =
  | 'claude-sonnet-4-20250514'
  | 'claude-haiku-4-20250514'
  | 'claude-opus-4-20250514';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<FileMomConfig> = {
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.*',                      // Hidden files
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
```

### Event Types

```typescript
/**
 * Events emitted by the Watcher
 */
export type WatcherEvent =
  | { type: 'file:created'; path: string }
  | { type: 'file:modified'; path: string }
  | { type: 'file:deleted'; path: string }
  | { type: 'file:renamed'; oldPath: string; newPath: string }
  | { type: 'error'; error: Error; path?: string };

/**
 * Events emitted during scanning
 */
export type ScannerEvent =
  | { type: 'scan:started'; folders: string[] }
  | { type: 'scan:progress'; scanned: number; total: number | null }
  | { type: 'scan:file'; file: ScannedFile }
  | { type: 'scan:error'; path: string; error: Error }
  | { type: 'scan:completed'; totalFiles: number; durationMs: number };

/**
 * Events emitted during execution
 */
export type ExecutorEvent =
  | { type: 'execute:started'; batchId: string; actionCount: number }
  | { type: 'execute:action'; actionId: string; action: Action }
  | { type: 'execute:success'; actionId: string }
  | { type: 'execute:failed'; actionId: string; error: Error }
  | { type: 'execute:completed'; result: ExecutionResult };
```

---

## Zod Validation Schemas

### Action Plan Schema (for Claude response validation)

```typescript
import { z } from 'zod';

export const ActionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_file', 'rename_file', 'create_folder', 'copy_file']),
  source: z.string().min(1),
  destination: z.string().min(1),
  reason: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export const ActionPlanSchema = z.object({
  intent: z.string().min(1).max(200),
  actions: z.array(ActionSchema).min(0).max(1000),
  needsReview: z.array(z.string().uuid()),
  summary: z.object({
    filesAffected: z.number().int().min(0),
    foldersCreated: z.number().int().min(0),
    totalSizeBytes: z.number().int().min(0),
  }),
  warnings: z.array(z.string()).max(20),
});

export type ActionPlanInput = z.infer<typeof ActionPlanSchema>;
```

### Configuration Schema

```typescript
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
  model: z.enum([
    'claude-sonnet-4-20250514',
    'claude-haiku-4-20250514',
    'claude-opus-4-20250514'
  ]).default('claude-sonnet-4-20250514'),
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
```

---

## SQLite Database Schema

### Files Table

```sql
CREATE TABLE IF NOT EXISTS files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  path            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  extension       TEXT NOT NULL,
  size            INTEGER NOT NULL,
  mtime           INTEGER NOT NULL,
  ctime           INTEGER NOT NULL,
  quick_hash      TEXT,
  extracted_text  TEXT,
  exif_json       TEXT,
  indexed_at      INTEGER NOT NULL,
  embedding_id    TEXT,

  -- Indexes for common queries
  CONSTRAINT valid_size CHECK (size >= 0),
  CONSTRAINT valid_mtime CHECK (mtime > 0),
  CONSTRAINT valid_ctime CHECK (ctime > 0)
);

-- Index for path lookups (unique constraint creates this automatically)
-- CREATE UNIQUE INDEX idx_files_path ON files(path);

-- Index for extension filtering
CREATE INDEX idx_files_extension ON files(extension);

-- Index for modification time queries
CREATE INDEX idx_files_mtime ON files(mtime DESC);

-- Index for name searches (prefix matching)
CREATE INDEX idx_files_name ON files(name COLLATE NOCASE);

-- Index for finding files needing re-extraction
CREATE INDEX idx_files_indexed_at ON files(indexed_at);
```

### Full-Text Search Table

```sql
-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  name,
  extracted_text,
  path,
  content='files',
  content_rowid='id',
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with files table
CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, name, extracted_text, path)
  VALUES (new.id, new.name, new.extracted_text, new.path);
END;

CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name, extracted_text, path)
  VALUES ('delete', old.id, old.name, old.extracted_text, old.path);
END;

CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name, extracted_text, path)
  VALUES ('delete', old.id, old.name, old.extracted_text, old.path);
  INSERT INTO files_fts(rowid, name, extracted_text, path)
  VALUES (new.id, new.name, new.extracted_text, new.path);
END;
```

### Transactions Table

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        TEXT NOT NULL,
  action_id       TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  source_path     TEXT NOT NULL,
  dest_path       TEXT NOT NULL,
  executed_at     INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  expires_at      INTEGER NOT NULL,
  error           TEXT,
  metadata_json   TEXT,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed', 'rolled_back')),
  CONSTRAINT valid_action_type CHECK (action_type IN ('move_file', 'rename_file', 'create_folder', 'copy_file'))
);

-- Index for batch lookups (undo operations)
CREATE INDEX idx_transactions_batch_id ON transactions(batch_id);

-- Index for finding expired transactions
CREATE INDEX idx_transactions_expires_at ON transactions(expires_at);

-- Index for status queries
CREATE INDEX idx_transactions_status ON transactions(status);
```

### Batches Table (Optional: stores original intent)

```sql
CREATE TABLE IF NOT EXISTS batches (
  batch_id        TEXT PRIMARY KEY,
  intent          TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  completed_at    INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending',
  action_count    INTEGER NOT NULL,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'partial', 'rolled_back'))
);
```

### Configuration Table (Optional: persisted settings)

```sql
CREATE TABLE IF NOT EXISTS config (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);
```

### Watched Folders Table

```sql
CREATE TABLE IF NOT EXISTS watched_folders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  path            TEXT NOT NULL UNIQUE,
  added_at        INTEGER NOT NULL,
  last_scan_at    INTEGER,
  file_count      INTEGER DEFAULT 0,
  enabled         INTEGER DEFAULT 1
);
```

---

## Claude Prompt Templates

### System Prompt

```typescript
export const SYSTEM_PROMPT = `You are FileMom, an AI assistant that helps users organize their files. Your job is to understand natural language commands about file organization and generate structured action plans.

RULES:
1. Always use absolute paths in your responses
2. Never suggest deleting files unless explicitly asked
3. Group related files together logically
4. Preserve original folder structure when it makes sense
5. Create descriptive folder names that non-technical users will understand
6. When unsure about a file's purpose, assign lower confidence (< 0.8)
7. Flag potential issues in the warnings array
8. Consider file dates, names, and content when organizing

CONFIDENCE GUIDELINES:
- 0.9-1.0: Very confident (clear filename, EXIF location, obvious category)
- 0.7-0.9: Confident (reasonable inference from context)
- 0.5-0.7: Uncertain (multiple valid destinations possible)
- 0.0-0.5: Needs review (ambiguous, could be wrong)

OUTPUT FORMAT:
You must respond with valid JSON matching the provided schema. Do not include any text outside the JSON object.`;
```

### User Prompt Template

```typescript
export function buildUserPrompt(
  command: string,
  files: FileIndexEntry[],
  context?: { recentFolders?: string[]; previousCommands?: string[] }
): string {
  const filesJson = JSON.stringify(files, null, 2);

  let prompt = `USER COMMAND: "${command}"

FILE INDEX (${files.length} files):
${filesJson}
`;

  if (context?.recentFolders?.length) {
    prompt += `
RECENTLY USED FOLDERS:
${context.recentFolders.map(f => `- ${f}`).join('\n')}
`;
  }

  prompt += `
Based on the user's command and the file index above, generate an action plan to organize these files. Consider:
- File names and extensions
- Modification dates
- Any extracted text or EXIF summaries
- The user's apparent intent

Return a JSON action plan.`;

  return prompt;
}
```

### JSON Schema for Claude (output_config)

```typescript
export const ACTION_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      description: 'Brief summary of what the plan will accomplish',
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier (UUID format)',
          },
          type: {
            type: 'string',
            enum: ['move_file', 'rename_file', 'create_folder', 'copy_file'],
          },
          source: {
            type: 'string',
            description: 'Absolute path to source file or folder',
          },
          destination: {
            type: 'string',
            description: 'Absolute path to destination',
          },
          reason: {
            type: 'string',
            description: 'Human-readable explanation for this action',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence level from 0.0 to 1.0',
          },
        },
        required: ['id', 'type', 'source', 'destination', 'reason', 'confidence'],
        additionalProperties: false,
      },
    },
    needsReview: {
      type: 'array',
      items: { type: 'string' },
      description: 'Action IDs that have confidence < 0.8',
    },
    summary: {
      type: 'object',
      properties: {
        filesAffected: { type: 'integer', minimum: 0 },
        foldersCreated: { type: 'integer', minimum: 0 },
        totalSizeBytes: { type: 'integer', minimum: 0 },
      },
      required: ['filesAffected', 'foldersCreated', 'totalSizeBytes'],
      additionalProperties: false,
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Potential issues or things the user should know',
    },
  },
  required: ['intent', 'actions', 'needsReview', 'summary', 'warnings'],
  additionalProperties: false,
};
```

---

## LanceDB Schema (Phase 2)

### Embeddings Collection

```typescript
interface EmbeddingRecord {
  id: string;           // Same as file path for uniqueness
  fileId: number;       // Foreign key to SQLite files.id
  vector: number[];     // 384 dimensions for MiniLM
  text: string;         // Original text that was embedded
  createdAt: number;    // Unix timestamp
}

// LanceDB table creation
const embeddingsTable = await db.createTable('embeddings', [
  {
    id: '/path/to/file.pdf',
    fileId: 123,
    vector: new Array(384).fill(0),  // Placeholder
    text: 'sample document text',
    createdAt: Date.now(),
  },
]);
```

---

## Error Types

```typescript
/**
 * Base error class for FileMom
 */
export class FileMomError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FileMomError';
  }
}

/**
 * Specific error types
 */
export class ScanError extends FileMomError {
  constructor(path: string, cause: Error) {
    super(
      `Failed to scan: ${path}`,
      'SCAN_ERROR',
      true,
      { path, cause: cause.message }
    );
  }
}

export class ExtractionError extends FileMomError {
  constructor(path: string, cause: Error) {
    super(
      `Failed to extract metadata: ${path}`,
      'EXTRACTION_ERROR',
      true,
      { path, cause: cause.message }
    );
  }
}

export class AIError extends FileMomError {
  constructor(message: string, cause?: Error) {
    super(
      message,
      'AI_ERROR',
      true,
      { cause: cause?.message }
    );
  }
}

export class ExecutionError extends FileMomError {
  constructor(actionId: string, message: string, cause?: Error) {
    super(
      message,
      'EXECUTION_ERROR',
      false,
      { actionId, cause: cause?.message }
    );
  }
}

export class ValidationError extends FileMomError {
  constructor(message: string, issues: string[]) {
    super(
      message,
      'VALIDATION_ERROR',
      false,
      { issues }
    );
  }
}
```
