# FileMom Backend Architecture

## Overview

FileMom is an AI-powered file organizer that lets users manage files using natural language commands. This document describes the backend engine architecture — a Node.js/TypeScript library that handles file scanning, metadata extraction, AI-powered organization planning, and safe file operations.

The backend is designed to be consumed by:
- **CLI** (development/testing)
- **Electron main process** (desktop app)
- **Future**: potential web service

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FILEMOM ENGINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         INDEXING LAYER                                │   │
│  │                                                                       │   │
│  │   ┌──────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐   │   │
│  │   │ Scanner  │───►│ Extractor │───►│  Indexer  │◄───│  Watcher  │   │   │
│  │   └──────────┘    └───────────┘    │ (SQLite)  │    │(chokidar) │   │   │
│  │                                    └───────────┘    └───────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         INTELLIGENCE LAYER                            │   │
│  │                                                                       │   │
│  │   ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐   │   │
│  │   │  Pre-Filter  │───►│  AI Interface   │───►│   Action Plan    │   │   │
│  │   │  (keyword)   │    │  (Claude API)   │    │   (validated)    │   │   │
│  │   └──────────────┘    └─────────────────┘    └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         EXECUTION LAYER                               │   │
│  │                                                                       │   │
│  │   ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐   │   │
│  │   │   Executor   │───►│ Transaction Log │───►│      Undo        │   │   │
│  │   │ (file ops)   │    │    (SQLite)     │    │    (rollback)    │   │   │
│  │   └──────────────┘    └─────────────────┘    └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      PHASE 2: SEMANTIC LAYER                          │   │
│  │                                                                       │   │
│  │   ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐   │   │
│  │   │  Embeddings  │───►│    LanceDB      │───►│ Semantic Search  │   │   │
│  │   │(Transformers)│    │  (vectors)      │    │   (pre-filter)   │   │   │
│  │   └──────────────┘    └─────────────────┘    └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Scanner

**Purpose**: Recursively discover files in user-selected folders.

**Responsibilities**:
- Traverse directory trees using `fast-glob`
- Collect basic file stats (size, mtime, ctime)
- Skip hidden files (configurable)
- Skip cloud placeholder files (iCloud `.*.icloud`, OneDrive cloud-only)
- Handle permission errors gracefully (log and continue)
- Support cancellation for long scans

**Input**: Array of folder paths to scan
**Output**: Async iterator of `ScannedFile` objects

**Performance Target**: 10,000 files in < 30 seconds

---

### 2. Extractor

**Purpose**: Extract metadata from files based on type.

**Responsibilities**:
- EXIF extraction from images (JPEG, PNG, HEIC, etc.)
- Text extraction from PDFs (first 3 pages, max 10KB)
- Text extraction from DOCX/Word documents
- Graceful fallback for unsupported types (filename + stats only)
- Cache extraction results (skip unchanged files)

**Libraries**:
| File Type | Library | Notes |
|-----------|---------|-------|
| Images | `exifreader` | Pure JS, no native deps |
| PDF | `pdf-parse` | Pure JS, based on pdf.js |
| DOCX | `mammoth` | Pure JS, extracts raw text |

**Input**: File path
**Output**: `ExtractedMetadata` object

**Performance Target**: 100 files/second for metadata-only, 10 files/second for full text extraction

---

### 3. Indexer

**Purpose**: Store and query file metadata in SQLite.

**Responsibilities**:
- Store file metadata (path, name, size, dates, hash)
- Store extracted content (text, EXIF summaries)
- Provide fast keyword search via FTS5
- Track indexing state (which files need re-extraction)
- Handle database migrations

**Database**: SQLite via `better-sqlite3`

**Key Design Decisions**:
- Single `files` table with nullable extraction columns
- FTS5 virtual table for full-text search on name + extracted_text
- `quick_hash` column for change detection (not security)
- Indexes on `path` (unique), `extension`, `mtime`

---

### 4. Watcher

**Purpose**: Detect file changes and trigger incremental re-indexing.

**Responsibilities**:
- Watch configured folders for changes
- Use native OS events (not polling) via `chokidar`
- Debounce rapid changes (100ms)
- Compare quick hashes to filter false positives
- Queue changes and batch process every 5 seconds
- Handle watched folder removal gracefully

**Events Emitted**:
- `file:created` - new file detected
- `file:modified` - existing file changed
- `file:deleted` - file removed
- `file:renamed` - file moved/renamed within watched scope

---

### 5. AI Interface

**Purpose**: Translate natural language commands into structured action plans.

**Responsibilities**:
- Pre-filter file index to relevant subset (keyword match)
- Construct Claude prompt with file context
- Parse and validate Claude's JSON response via Zod
- Handle API errors and rate limits
- Support streaming responses (for UI progress)

**Claude Integration**:
- Model: Claude Sonnet 4 (balance of speed/quality)
- Output: Structured JSON via `output_config.format`
- Max files per request: 500 (to stay within token limits)
- Retry logic: 3 attempts with exponential backoff

**Pre-filtering Strategy**:
1. Keyword extraction from user command
2. FTS5 search on filename + extracted text
3. Path substring matching
4. Return top 500 most relevant files

---

### 6. Executor

**Purpose**: Perform file operations safely and reversibly.

**Responsibilities**:
- Validate action plan before execution
- Create folders in correct order (topological sort)
- Move files using copy-then-delete pattern
- Handle cross-volume moves (EXDEV error)
- Preserve macOS extended attributes
- Handle Windows file locks with retry
- Resolve naming conflicts with ` (1)` suffixes
- Log every operation to transaction log BEFORE executing
- Update SQLite index after successful operations

**Safety Guarantees**:
- **Never use `fs.rename()`** for moves (copy-then-delete only)
- **Never overwrite** existing files (add suffix)
- **Never delete source** until copy is verified
- **Always log first** then execute

**Concurrency**: Max 20 parallel file operations

---

### 7. Transaction Log

**Purpose**: Enable undo/rollback of file operations.

**Responsibilities**:
- Record every file operation with full details
- Group related operations by batch ID
- Support rollback of individual operations or entire batches
- Auto-expire old transactions (30-minute TTL)
- Cleanup expired records periodically

**Undo Logic**:
1. Reverse operations in LIFO order within batch
2. Move files back to original locations
3. Delete created folders (if empty)
4. Mark transaction as `rolled_back`
5. Update SQLite index

---

### 8. Embeddings (Phase 2)

**Purpose**: Enable semantic search for better file matching.

**Responsibilities**:
- Generate embeddings for file metadata + extracted text
- Store embeddings in LanceDB
- Support semantic similarity search
- Integrate with pre-filter step in AI Interface

**Strategy**: Hybrid approach
- **Text embeddings**: Transformers.js with `all-MiniLM-L6-v2` (local, free)
- **Image understanding**: Claude Vision API (only for photos without useful EXIF)

---

## Data Flow

### Indexing Flow (Background)

```
User selects folders
        │
        ▼
┌───────────────┐
│    Scanner    │ ──► Emits: path, name, ext, size, mtime, ctime
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Extractor   │ ──► Adds: quickHash, extractedText, exifData
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    Indexer    │ ──► Stores in SQLite, updates FTS5
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    Watcher    │ ──► Monitors for changes, triggers re-index
└───────────────┘
```

### Command Flow (User-Initiated)

```
User: "organize my Hawaii photos"
        │
        ▼
┌───────────────┐
│  Pre-Filter   │ ──► Keywords: "hawaii", "photos"
│               │     FTS5 search + path matching
└───────┬───────┘     Returns: 47 relevant files
        │
        ▼
┌───────────────┐
│ AI Interface  │ ──► Prompt: file list + user command
│  (Claude)     │     Response: ActionPlan JSON
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Validate    │ ──► Zod schema validation
│               │     Check paths exist
└───────┬───────┘     Flag low-confidence actions
        │
        ▼
┌───────────────┐
│  Return Plan  │ ──► To UI for user approval
└───────────────┘

        ... user approves ...

        │
        ▼
┌───────────────┐
│   Executor    │ ──► Log to transaction table
│               │     Create folders
└───────┬───────┘     Copy files, delete originals
        │
        ▼
┌───────────────┐
│ Update Index  │ ──► Update paths in SQLite
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    Return     │ ──► ExecutionResult with success/failure
└───────────────┘
```

---

## Error Handling Strategy

### Recoverable Errors (Retry)

| Error | Cause | Strategy |
|-------|-------|----------|
| `EBUSY` | File locked (Windows) | Retry 5x with exponential backoff |
| `EPERM` | Antivirus interference | Retry 3x, then fail |
| `ENOSPC` | Disk full | Fail immediately, clear message |
| API timeout | Network issues | Retry 3x with backoff |
| API rate limit | Too many requests | Wait and retry with Retry-After |

### Non-Recoverable Errors (Fail)

| Error | Cause | Strategy |
|-------|-------|----------|
| `ENOENT` | Source file missing | Skip, log warning |
| `EACCES` | Permission denied | Skip, log warning, suggest fix |
| Invalid API key | Configuration issue | Fail with clear message |
| Schema validation | Claude returned bad JSON | Retry once, then fail |

### Partial Failure Handling

When a batch operation partially fails:
1. Complete all possible operations
2. Log failures with reasons
3. Return mixed result (successes + failures)
4. Undo is still available for completed operations

---

## Configuration

```typescript
interface FileMomConfig {
  // Paths
  dataDir: string;              // Where to store SQLite, logs

  // Scanning
  watchedFolders: string[];     // Folders to index
  excludePatterns: string[];    // Glob patterns to skip
  includeHidden: boolean;       // Include dotfiles

  // Extraction
  maxTextLength: number;        // Max chars to extract (default: 10000)
  extractionTimeout: number;    // Per-file timeout ms (default: 5000)

  // AI
  anthropicApiKey: string;
  model: string;                // default: 'claude-sonnet-4-20250514'
  maxFilesPerRequest: number;   // default: 500

  // Execution
  undoTTLMinutes: number;       // default: 30
  maxConcurrentOps: number;     // default: 20

  // Phase 2
  enableEmbeddings: boolean;    // default: false
  embeddingModel: string;       // default: 'all-MiniLM-L6-v2'
}
```

---

## Security Considerations

### File System Safety
- All paths are normalized and validated
- No operations outside configured watched folders
- Copy-then-delete prevents data loss
- Transaction log enables recovery

### API Key Storage
- Keys stored via OS-native secure storage when in Electron
- CLI uses environment variables or config file
- Never logged or included in error messages

### Input Validation
- All user input sanitized
- File paths checked for traversal attacks
- Claude responses validated via Zod schema
- Action plans validated before execution

---

## Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Initial scan (10K files) | < 30 seconds | Time to emit all ScannedFile objects |
| Full index build (10K files) | < 3 minutes | Time to complete extraction + SQLite insert |
| Keyword search | < 100ms | FTS5 query + result formatting |
| AI plan generation | < 10 seconds | API call + validation |
| File move (single) | < 1 second | Copy + delete + index update |
| Batch move (100 files) | < 30 seconds | Parallel with concurrency limit |
| Undo (100 files) | < 30 seconds | Reverse batch |

---

## Testing Strategy

### Unit Tests
- Each component tested in isolation
- Mock file system with `memfs` or `mock-fs`
- Mock Claude API responses
- 80%+ code coverage target

### Integration Tests
- Real file system operations in temp directories
- Real SQLite database
- Mocked Claude API (recorded responses)
- End-to-end flows (scan → index → plan → execute → undo)

### Manual Testing via CLI
- `filemom scan` - verify scanner works
- `filemom search` - verify indexer/FTS
- `filemom plan` - verify AI integration
- `filemom execute` - verify file operations
- `filemom undo` - verify rollback

---

## Future Considerations

### Phase 2: Semantic Search
- Transformers.js for local embeddings
- LanceDB for vector storage
- Hybrid search (keyword + semantic)

### Phase 3: Intelligence
- Learning from user corrections
- Proactive suggestions
- Multi-step operations

### Potential Optimizations
- Worker threads for extraction
- Incremental FTS updates
- Embedding caching
- Compression for large indexes
