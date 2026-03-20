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
  extractedText: string | null;   // Text content (max 10KB). For audio: "Artist: X | Album: Y | ..."
  exif: ExifData | null;          // EXIF data for images
  detectedMimeType: string | null; // Actual MIME type detected via magic bytes (file-type)
  extractionError: string | null; // Error message if extraction failed
  extractedAt: number;            // Unix ms timestamp
}

/**
 * Output from VisionEnricher — visual understanding of file contents
 */
export interface VisionResult {
  path: string;
  description: string;        // "Beach sunset photo with two people, tropical setting"
  category: string;           // "photo", "screenshot", "document", "diagram", "receipt"
  tags: string[];             // ["beach", "sunset", "people", "tropical"]
  confidence: number;         // 0.0 to 1.0
  model: string;              // Which Claude model was used
  enrichedAt: number;         // Unix ms timestamp
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
  embeddingId: string | null;     // Reserved for future use (embeddings use file_embeddings table)
  visionDescription: string | null;   // AI-generated visual description
  visionCategory: string | null;      // "photo", "screenshot", "document", etc.
  visionTags: string | null;          // JSON stringified string[]
  enrichedAt: number | null;          // When VLM processing completed
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
  visionDescription: string | null;   // "Beach sunset with two people"
}
```

### Action Plan Types

```typescript
/**
 * Single action in an action plan
 */
export interface Action {
  id: string;                     // String identifier for tracking
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

/**
 * Options for refining an existing action plan via conversational feedback
 */
export interface RefinePlanOptions {
  plan: ActionPlan;              // The current plan to refine
  feedback: string;              // Natural language feedback from user
  fileIndex: FileIndexEntry[];   // Original file context
  history: string[];             // Previous feedback strings in this session
}

/**
 * Tracks the state of a plan refinement session
 */
export interface RefinementSession {
  sessionId: string;             // UUID
  originalCommand: string;       // The initial user command
  currentPlan: ActionPlan;       // Latest version of the plan
  feedbackHistory: string[];     // All feedback given so far
  round: number;                 // Current refinement round (0-based)
  maxRounds: number;             // Maximum allowed rounds (default: 3)
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
  openRouterApiKey: string;
  model: string;                    // OpenRouter format: 'provider/model-name'
  maxFilesPerRequest: number;
  requestTimeoutMs: number;

  // Execution
  undoTTLMinutes: number;
  maxConcurrentOps: number;
  retryAttempts: number;
  retryDelayMs: number;

  // Vision enrichment
  enableVisionEnrichment: boolean;
  visionModel: string;
  visionMaxImageDimension: number;
  visionBatchSize: number;
  visionMinTextThreshold: number;

  // Plan refinement
  maxRefinementRounds: number;

  // Phase 2
  enableEmbeddings: boolean;
  embeddingModel: string;
  embeddingDimensions: number;
}

// AIModel is now a flexible string in OpenRouter format: 'provider/model-name'
// Examples: 'anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4.5', 'google/gemini-2.5-flash'

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
  model: 'anthropic/claude-sonnet-4',
  maxFilesPerRequest: 500,
  requestTimeoutMs: 30000,
  undoTTLMinutes: 30,
  maxConcurrentOps: 20,
  retryAttempts: 3,
  retryDelayMs: 1000,
  enableEmbeddings: false,
  embeddingModel: 'all-MiniLM-L6-v2',
  enableVisionEnrichment: true,
  visionModel: 'anthropic/claude-haiku-4.5',
  visionMaxImageDimension: 1024,
  visionBatchSize: 50,
  visionMinTextThreshold: 50,
  maxRefinementRounds: 3,
  embeddingDimensions: 384,
};
```

### Smart Folder Types

```typescript
/**
 * A sample of files returned during the Smart Folder guided flow
 */
export interface SmartFolderSample {
  files: SearchResult[];           // 3-5 representative files
  totalMatches: number;            // Total files matching current criteria
  suggestedFolderName: string;     // AI-suggested folder name
}

/**
 * Tracks the state of a Smart Folder session
 */
export interface SmartFolderState {
  sessionId: string;               // UUID
  history: string[];               // User inputs so far ("tax documents", "not receipts")
  currentQuery: string;            // Derived search query
  excludePatterns: string[];       // Terms/patterns to exclude
  matchedFileIds: number[];        // File IDs matching current criteria
  status: 'refining' | 'confirmed' | 'cancelled';
}
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
  id: z.string().min(1),          // String identifier (models don't reliably generate UUIDs)
  type: z.enum(['move_file', 'rename_file', 'create_folder', 'copy_file']),
  source: z.string().min(1),
  destination: z.string().min(1),
  reason: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export const ActionPlanSchema = z.object({
  intent: z.string().min(1).max(200),
  actions: z.array(ActionSchema).min(0).max(1000),
  needsReview: z.array(z.string()),
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
  openRouterApiKey: z.string().min(1),
  model: z.string().min(1).default('anthropic/claude-sonnet-4'),  // OpenRouter format: 'provider/model-name'
  maxFilesPerRequest: z.number().int().min(10).max(1000).default(500),
  requestTimeoutMs: z.number().int().min(5000).max(120000).default(30000),
  undoTTLMinutes: z.number().int().min(5).max(1440).default(30),
  maxConcurrentOps: z.number().int().min(1).max(50).default(20),
  retryAttempts: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().min(100).max(10000).default(1000),
  enableEmbeddings: z.boolean().default(false),
  embeddingModel: z.string().default('all-MiniLM-L6-v2'),
  enableVisionEnrichment: z.boolean().default(true),
  visionModel: z.string().min(1).default('anthropic/claude-haiku-4.5'),  // OpenRouter format
  visionMaxImageDimension: z.number().int().min(200).max(2048).default(1024),
  visionBatchSize: z.number().int().min(1).max(200).default(50),
  visionMinTextThreshold: z.number().int().min(0).max(1000).default(50),
  maxRefinementRounds: z.number().int().min(1).max(10).default(3),
  embeddingDimensions: z.number().int().min(64).max(2048).default(384),
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
  vision_description TEXT,
  vision_category    TEXT,
  vision_tags        TEXT,          -- JSON array of strings
  enriched_at        INTEGER,

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

-- Index for finding files needing vision enrichment
CREATE INDEX idx_files_enriched_at ON files(enriched_at);
```

### Full-Text Search Table

```sql
-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  name,
  extracted_text,
  path,
  vision_description,
  content='files',
  content_rowid='id',
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with files table
CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, name, extracted_text, path, vision_description)
  VALUES (new.id, new.name, new.extracted_text, new.path, new.vision_description);
END;

CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name, extracted_text, path, vision_description)
  VALUES ('delete', old.id, old.name, old.extracted_text, old.path, old.vision_description);
END;

CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name, extracted_text, path, vision_description)
  VALUES ('delete', old.id, old.name, old.extracted_text, old.path, old.vision_description);
  INSERT INTO files_fts(rowid, name, extracted_text, path, vision_description)
  VALUES (new.id, new.name, new.extracted_text, new.path, new.vision_description);
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
            description: 'Unique string identifier for tracking',
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

### Vision Enrichment Prompt

```typescript
export const VISION_SYSTEM_PROMPT = `You are a file analysis assistant. Describe the visual contents of this file for use in a file organization system.

RULES:
1. Provide a concise 1-2 sentence description of what the file contains
2. Classify into exactly one category: photo, screenshot, document, diagram, receipt, meme, artwork, or other
3. Extract 3-8 descriptive tags
4. Assign a confidence level for your classification

OUTPUT FORMAT:
Respond with valid JSON matching the provided schema.`;

export const VISION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'Concise 1-2 sentence description of the file contents',
    },
    category: {
      type: 'string',
      enum: ['photo', 'screenshot', 'document', 'diagram', 'receipt', 'meme', 'artwork', 'other'],
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 8,
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['description', 'category', 'tags', 'confidence'],
  additionalProperties: false,
};
```

### Refinement Prompt

```typescript
export const REFINEMENT_SYSTEM_PROMPT = `You are FileMom, an AI assistant that helps users organize their files. You are refining an existing action plan based on user feedback.

RULES:
1. Keep all actions the user did not mention — only modify what they asked to change
2. If the user says to exclude certain files, remove those actions entirely
3. If the user wants to change destinations, update the relevant actions
4. Preserve the same JSON schema as the original plan
5. Update the summary counts to reflect the changes
6. Update needsReview if confidence changes`;

export function buildRefinementPrompt(
  plan: ActionPlan,
  feedback: string,
  history: string[]
): string {
  return `CURRENT PLAN:
${JSON.stringify(plan, null, 2)}

USER FEEDBACK:
"${feedback}"

${history.length > 0 ? `PREVIOUS FEEDBACK IN THIS SESSION:\n${history.map((h, i) => `${i + 1}. "${h}"`).join('\n')}\n` : ''}
Regenerate the action plan incorporating the user's feedback. Return a complete ActionPlan JSON.`;
}
```

---

## sqlite-vec Schema (Phase 2)

### Vector Embeddings Table

```sql
-- sqlite-vec virtual table for vector similarity search
-- Stored in the same SQLite database as files and transactions
CREATE VIRTUAL TABLE IF NOT EXISTS file_embeddings USING vec0(
  file_id INTEGER PRIMARY KEY,
  embedding FLOAT[384]
);
```

```typescript
// Embedding generation using Transformers.js
interface EmbeddingRecord {
  fileId: number;         // Foreign key to files.id
  embedding: number[];    // 384 dimensions (all-MiniLM-L6-v2)
}

// Hybrid search combines FTS5 keyword score with vector cosine similarity
interface HybridSearchResult {
  fileId: number;
  ftsScore: number;       // FTS5 relevance score
  vectorScore: number;    // Cosine similarity (0-1)
  combinedScore: number;  // Weighted combination
}
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
