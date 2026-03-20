# FileMom Engine API

This document describes the public API of the FileMom engine. This is the interface that both the CLI and Electron app will use.

---

## Installation

```bash
# From monorepo root
pnpm install

# Or if published
npm install @filemom/engine
```

---

## Quick Start

```typescript
import { FileMom } from '@filemom/engine';

const filemom = new FileMom({
  dataDir: '~/.filemom',
  watchedFolders: ['~/Documents', '~/Downloads'],
  openRouterApiKey: process.env.OPENROUTER_API_KEY!,
});

await filemom.initialize();

// Scan and index files (includes vision enrichment in background)
await filemom.scan();

// Generate an action plan
const plan = await filemom.plan('organize my tax documents');

// Show plan to user for review...
// User gives feedback
const refinedPlan = await filemom.refinePlan({
  plan,
  feedback: 'don\'t move the receipts, only tax forms',
  fileIndex: plan._matchedFiles,  // from the original plan call
  history: [],
});

// Execute the refined plan (after user approval)
const result = await filemom.execute(refinedPlan);

// Undo if needed
await filemom.undo(result.batchId);

await filemom.shutdown();
```

---

## Main Class: `FileMom`

### Constructor

```typescript
constructor(config: FileMomConfig)
```

Creates a new FileMom instance. Does not start any background processes.

**Parameters:**
- `config` - Configuration object (see SCHEMAS.md for full definition)

**Required config fields:**
- `dataDir` - Directory for SQLite database and logs
- `watchedFolders` - Array of folders to index
- `openRouterApiKey` - OpenRouter API key for AI models

---

### Core Methods

#### `initialize(): Promise<void>`

Initializes the engine: creates database, runs migrations, starts file watcher.

```typescript
await filemom.initialize();
```

**Throws:** `FileMomError` if initialization fails

---

#### `shutdown(): Promise<void>`

Gracefully shuts down: stops watcher, closes database connections.

```typescript
await filemom.shutdown();
```

---

#### `scan(options?: ScanOptions): Promise<ScanResult>`

Scans watched folders and updates the index.

```typescript
interface ScanOptions {
  folders?: string[];     // Override watched folders
  fullRescan?: boolean;   // Ignore existing index, rescan everything
  onProgress?: (event: ScannerEvent) => void;
}

interface ScanResult {
  totalFiles: number;
  newFiles: number;
  updatedFiles: number;
  deletedFiles: number;
  errors: Array<{ path: string; error: string }>;
  durationMs: number;
}

// Basic scan
const result = await filemom.scan();

// Scan specific folders
const result = await filemom.scan({
  folders: ['~/Desktop'],
});

// Full rescan with progress
const result = await filemom.scan({
  fullRescan: true,
  onProgress: (event) => {
    if (event.type === 'scan:progress') {
      console.log(`Scanned ${event.scanned} files`);
    }
  },
});
```

---

#### `search(query: string, options?: SearchOptions): Promise<SearchResult[]>`

Search the file index using keywords.

```typescript
interface SearchOptions {
  limit?: number;         // Max results (default: 100)
  extensions?: string[];  // Filter by extension
  folders?: string[];     // Filter by folder prefix
  minSize?: number;       // Min file size in bytes
  maxSize?: number;       // Max file size in bytes
  modifiedAfter?: Date;   // Modified after date
  modifiedBefore?: Date;  // Modified before date
}

interface SearchResult {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  score: number;          // Relevance score
  snippet: string | null; // Matching text snippet
}

// Basic search
const results = await filemom.search('tax documents 2023');

// Filtered search
const results = await filemom.search('invoice', {
  extensions: ['pdf'],
  modifiedAfter: new Date('2024-01-01'),
  limit: 50,
});
```

**Search modes:**
- **Keyword (default)**: FTS5 full-text search on filename, extracted text, path, and vision descriptions
- **Semantic (when `enableEmbeddings: true`)**: Hybrid search combining FTS5 keyword scores with sqlite-vec vector cosine similarity for meaning-based matching

---

#### `plan(command: string, options?: PlanOptions): Promise<ActionPlan>`

Generate an action plan from a natural language command.

```typescript
interface PlanOptions {
  previewOnly?: boolean;  // Don't call Claude, just return matched files
  maxFiles?: number;      // Override max files sent to Claude
  context?: {
    recentFolders?: string[];
    previousCommands?: string[];
  };
}

// Generate a plan
const plan = await filemom.plan('put all my Hawaii photos on the Desktop');

// Preview which files would be included
const preview = await filemom.plan('organize work files', {
  previewOnly: true,
});
```

**Returns:** `ActionPlan` object (see SCHEMAS.md)

**Throws:**
- `AIError` if Claude API fails
- `ValidationError` if response doesn't match schema

---

#### `refinePlan(options: RefinePlanOptions): Promise<ActionPlan>`

Refine an existing action plan based on natural language user feedback.

```typescript
interface RefinePlanOptions {
  plan: ActionPlan;              // The current plan to refine
  feedback: string;              // Natural language feedback
  fileIndex: FileIndexEntry[];   // The original file context
  history: string[];             // Previous feedback strings in this session
}

// First round of feedback
const refined1 = await filemom.refinePlan({
  plan: originalPlan,
  feedback: 'don\'t move the PDFs',
  fileIndex: matchedFiles,
  history: [],
});

// Second round of feedback
const refined2 = await filemom.refinePlan({
  plan: refined1,
  feedback: 'put the photos in ~/Pictures instead of ~/Desktop',
  fileIndex: matchedFiles,
  history: ['don\'t move the PDFs'],
});

// Execute the final version
const result = await filemom.execute(refined2);
```

**Returns:** Updated `ActionPlan` incorporating the feedback

**Throws:**
- `AIError` if Claude API fails
- `ValidationError` if refined plan doesn't match schema
- `FileMomError` with code `MAX_REFINEMENTS_EXCEEDED` if session exceeds `maxRefinementRounds`

**Notes:**
- Maximum 3 refinement rounds per session (configurable via `maxRefinementRounds`)
- Each call sends the current plan + all feedback history to Claude for context
- The original file index is preserved across rounds (no re-querying)

---

#### `execute(plan: ActionPlan, options?: ExecuteOptions): Promise<ExecutionResult>`

Execute an action plan.

```typescript
interface ExecuteOptions {
  dryRun?: boolean;       // Log actions but don't execute
  stopOnError?: boolean;  // Stop at first error (default: false)
  onProgress?: (event: ExecutorEvent) => void;
}

// Execute with progress
const result = await filemom.execute(plan, {
  onProgress: (event) => {
    if (event.type === 'execute:action') {
      console.log(`Moving: ${event.action.source}`);
    }
  },
});

// Dry run
const result = await filemom.execute(plan, { dryRun: true });
console.log(`Would affect ${result.summary.succeeded} files`);
```

**Returns:** `ExecutionResult` object (see SCHEMAS.md)

---

#### `undo(batchId: string): Promise<ExecutionResult>`

Undo a previous execution batch.

```typescript
const undoResult = await filemom.undo(result.batchId);
console.log(`Reverted ${undoResult.summary.succeeded} operations`);
```

**Throws:**
- `FileMomError` with code `BATCH_NOT_FOUND` if batch doesn't exist
- `FileMomError` with code `BATCH_EXPIRED` if past TTL
- `FileMomError` with code `BATCH_ALREADY_UNDONE` if already rolled back

---

#### `getUndoableBatches(): Promise<BatchSummary[]>`

List batches that can still be undone.

```typescript
const batches = await filemom.getUndoableBatches();
for (const batch of batches) {
  console.log(`${batch.batchId}: ${batch.intent} (${batch.actionCount} actions)`);
  console.log(`  Expires: ${new Date(batch.expiresAt).toLocaleString()}`);
}
```

---

### Smart Folder (Guided Workflow)

#### `startSmartFolder(): SmartFolderSession`

Start a guided "Create Folder with AI" session. Returns a session object for the multi-turn conversation.

```typescript
interface SmartFolderSample {
  files: SearchResult[];           // 3-5 representative files
  totalMatches: number;            // Total files matching current criteria
  suggestedFolderName: string;     // AI-suggested folder name
}

interface SmartFolderSession {
  /** Refine the file selection with a natural language description or feedback */
  refine(input: string): Promise<SmartFolderSample>;

  /** Confirm the current selection and generate an action plan */
  confirm(options?: { folderName?: string; folderPath?: string }): Promise<ActionPlan>;

  /** Cancel the session */
  cancel(): void;
}
```

**Usage:**

```typescript
// Start guided session
const session = filemom.startSmartFolder();

// First round: describe what you want
const sample1 = await session.refine('tax documents');
// → { files: [tax_2023.pdf, W2_acme.pdf, receipt.pdf], totalMatches: 34, suggestedFolderName: "Tax Documents" }

// User says "not receipts" — refine
const sample2 = await session.refine('yes but not receipts');
// → { files: [tax_2023.pdf, W2_acme.pdf, 1099_freelance.pdf], totalMatches: 28, suggestedFolderName: "Tax Documents" }

// User approves — generate plan
const plan = await session.confirm({
  folderPath: '~/Documents/Tax Documents',
});

// Execute as normal
const result = await filemom.execute(plan);
```

**CLI equivalent:**

```bash
# Interactive guided flow
filemom create-folder

# Or with initial description
filemom create-folder "tax documents"
```

---

### Index Management

#### `getStats(): Promise<IndexStats>`

Get statistics about the file index.

```typescript
interface IndexStats {
  totalFiles: number;
  totalSize: number;
  byExtension: Record<string, number>;
  oldestFile: Date;
  newestFile: Date;
  lastScanAt: Date | null;
  watchedFolders: Array<{
    path: string;
    fileCount: number;
    lastScanAt: Date | null;
  }>;
}

const stats = await filemom.getStats();
console.log(`Indexed ${stats.totalFiles} files (${stats.totalSize} bytes)`);
```

---

#### `getFile(path: string): Promise<FileRecord | null>`

Get a single file record by path.

```typescript
const file = await filemom.getFile('/Users/nick/Documents/resume.pdf');
if (file) {
  console.log(`Size: ${file.size}, Modified: ${new Date(file.mtime)}`);
}
```

---

#### `rebuildIndex(): Promise<void>`

Drop and rebuild the entire index. Use with caution.

```typescript
await filemom.rebuildIndex();
```

---

### Vision Enrichment

#### `enrichFiles(options?: EnrichOptions): Promise<EnrichResult>`

Run vision enrichment on files that need visual understanding. Normally called automatically after scanning, but can be triggered manually.

```typescript
interface EnrichOptions {
  paths?: string[];           // Specific files to enrich (default: all unenriched)
  force?: boolean;            // Re-enrich already processed files
  model?: string;              // Override default vision model (OpenRouter format)
  onProgress?: (event: EnrichEvent) => void;
}

interface EnrichResult {
  enriched: number;           // Files successfully enriched
  skipped: number;            // Files that didn't need enrichment
  failed: number;             // Files that failed enrichment
  errors: Array<{ path: string; error: string }>;
}

type EnrichEvent =
  | { type: 'enrich:started'; totalFiles: number }
  | { type: 'enrich:progress'; completed: number; total: number }
  | { type: 'enrich:file'; path: string; result: VisionResult }
  | { type: 'enrich:error'; path: string; error: Error }
  | { type: 'enrich:completed'; result: EnrichResult };

// Manual enrichment
const result = await filemom.enrichFiles({
  onProgress: (event) => {
    if (event.type === 'enrich:progress') {
      console.log(`Enriched ${event.completed}/${event.total} files`);
    }
  },
});

// Enrich specific files
await filemom.enrichFiles({ paths: ['~/Downloads/IMG_4523.jpg'] });

// Force re-enrich with Sonnet for better descriptions
await filemom.enrichFiles({
  paths: ['~/Documents/scan.pdf'],
  model: 'anthropic/claude-sonnet-4',
  force: true,
});
```

---

### Folder Management

#### `addWatchedFolder(path: string): Promise<void>`

Add a folder to watch list and trigger initial scan.

```typescript
await filemom.addWatchedFolder('~/Pictures');
```

---

#### `removeWatchedFolder(path: string): Promise<void>`

Remove a folder from watch list and delete its files from index.

```typescript
await filemom.removeWatchedFolder('~/Pictures');
```

---

#### `getWatchedFolders(): Promise<WatchedFolder[]>`

List all watched folders with stats.

```typescript
interface WatchedFolder {
  path: string;
  fileCount: number;
  lastScanAt: Date | null;
  enabled: boolean;
}

const folders = await filemom.getWatchedFolders();
```

---

### Events

The FileMom class extends EventEmitter and emits the following events:

```typescript
// Watcher events
filemom.on('file:created', (path: string) => {});
filemom.on('file:modified', (path: string) => {});
filemom.on('file:deleted', (path: string) => {});
filemom.on('file:renamed', (oldPath: string, newPath: string) => {});

// Index events
filemom.on('index:updated', (stats: { added: number; updated: number; deleted: number }) => {});

// Error events
filemom.on('error', (error: FileMomError) => {});
```

---

## Individual Components

For advanced usage, you can import and use individual components:

### Scanner

```typescript
import { Scanner } from '@filemom/engine';

const scanner = new Scanner({
  excludePatterns: ['**/node_modules/**'],
  includeHidden: false,
});

// Scan returns async iterator
for await (const file of scanner.scan(['~/Documents'])) {
  console.log(file.path);
}

// Or collect all
const files = await scanner.scanAll(['~/Documents']);
```

---

### Extractor

```typescript
import { Extractor } from '@filemom/engine';

const extractor = new Extractor({
  maxTextLength: 10000,
  timeoutMs: 5000,
});

const metadata = await extractor.extract('/path/to/file.pdf');
console.log(metadata.extractedText);
console.log(metadata.quickHash);
```

---

### Indexer

```typescript
import { Indexer } from '@filemom/engine';

const indexer = new Indexer({
  dbPath: '~/.filemom/index.db',
});

await indexer.initialize();

// Insert/update files
await indexer.upsertFile(fileRecord);

// Search
const results = await indexer.search('query', { limit: 100 });

// Get by path
const file = await indexer.getByPath('/path/to/file');

await indexer.close();
```

---

### AIInterface

```typescript
import { AIInterface } from '@filemom/engine';

const ai = new AIInterface({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'anthropic/claude-sonnet-4',
});

const plan = await ai.generatePlan(
  'organize my photos',
  fileIndexEntries
);
```

---

### Executor

```typescript
import { Executor } from '@filemom/engine';

const executor = new Executor({
  maxConcurrent: 20,
  retryAttempts: 3,
});

const result = await executor.execute(plan, transactionLog);
```

---

### TransactionLog

```typescript
import { TransactionLog } from '@filemom/engine';

const log = new TransactionLog({
  dbPath: '~/.filemom/index.db',
  ttlMinutes: 30,
});

await log.initialize();

// Record a transaction
const txId = await log.record({
  batchId: 'batch-123',
  actionId: 'action-456',
  actionType: 'move_file',
  sourcePath: '/old/path',
  destPath: '/new/path',
});

// Mark completed
await log.complete(txId);

// Rollback
await log.rollback('batch-123');

// Cleanup expired
await log.cleanupExpired();
```

---

### VisionEnricher

```typescript
import { VisionEnricher } from '@filemom/engine';

const enricher = new VisionEnricher({
  apiKey: process.env.OPENROUTER_API_KEY!,
  enrichmentModel: 'anthropic/claude-haiku-4.5',
  maxImageDimension: 1024,
  batchSize: 50,
});

// Enrich a single file
const result = await enricher.enrich('/path/to/IMG_4523.jpg');
console.log(result.description);  // "Beach sunset with two people"
console.log(result.category);     // "photo"
console.log(result.tags);         // ["beach", "sunset", "people"]

// Batch enrich (uses Batch API for 50% discount)
const results = await enricher.enrichBatch([
  '/path/to/IMG_4523.jpg',
  '/path/to/screenshot.png',
  '/path/to/scanned_doc.pdf',
]);
```

---

### Embeddings

```typescript
import { Embeddings } from '@filemom/engine';

const embeddings = new Embeddings({
  model: 'all-MiniLM-L6-v2',
  dimensions: 384,
  dbPath: '~/.filemom/index.db',  // Same SQLite DB as file index
});

await embeddings.initialize();  // Loads sqlite-vec extension + Transformers.js model

// Generate and store embedding for a file
await embeddings.embed(fileId, 'beach sunset photo with two people tropical setting');

// Semantic search
const results = await embeddings.search('vacation pictures', { limit: 20 });

// Hybrid search (FTS5 + vector)
const hybrid = await embeddings.hybridSearch('vacation pictures', {
  ftsWeight: 0.4,
  vectorWeight: 0.6,
  limit: 20,
});
```

---

## CLI Usage

The CLI wraps the engine API for command-line usage:

```bash
# Initialize (first run)
filemom init

# Add folders to watch
filemom add ~/Documents ~/Downloads

# Scan and index
filemom scan

# Show index stats
filemom status

# Search files
filemom search "hawaii photos"

# Generate action plan (interactive — shows plan and asks for approval)
filemom plan "organize my tax documents"
# → Shows plan table
# → Prompts: Approve? [y/n/feedback]
# → Type feedback to refine: "don't move receipts"
# → Shows updated plan
# → Type 'y' to execute

# Generate plan without executing (save to file)
filemom plan "organize downloads" --save plan.json

# Execute a saved plan file
filemom execute plan.json

# Show undo history
filemom history

# Undo last batch
filemom undo

# Undo specific batch
filemom undo --batch abc123

# Debug: extract single file
filemom extract ~/photo.jpg

# Debug: show file record
filemom info ~/document.pdf

# Configuration
filemom config set model anthropic/claude-haiku-4.5
filemom config get model
filemom config list
```

---

## Error Handling

All errors extend `FileMomError` with a `code` property:

```typescript
try {
  await filemom.execute(plan);
} catch (error) {
  if (error instanceof FileMomError) {
    switch (error.code) {
      case 'SCAN_ERROR':
        // Handle scan errors
        break;
      case 'AI_ERROR':
        // Handle Claude API errors
        break;
      case 'EXECUTION_ERROR':
        // Handle file operation errors
        break;
      case 'VALIDATION_ERROR':
        // Handle validation errors
        break;
      default:
        // Unknown error
        throw error;
    }
  }
}
```

---

## Configuration File

The CLI reads configuration from `~/.filemom/config.json`:

```json
{
  "watchedFolders": [
    "/Users/nick/Documents",
    "/Users/nick/Downloads"
  ],
  "excludePatterns": [
    "**/node_modules/**",
    "**/.git/**"
  ],
  "model": "anthropic/claude-sonnet-4",
  "undoTTLMinutes": 30,
  "enableVisionEnrichment": true,
  "visionModel": "anthropic/claude-haiku-4.5",
  "maxRefinementRounds": 3
}
```

API key should be set via environment variable:

```bash
export OPENROUTER_API_KEY=sk-or-...
```

Or in a `.env` file in the data directory:

```
# ~/.filemom/.env
OPENROUTER_API_KEY=sk-or-...
```
