# FileMom Implementation Plan

This document outlines the implementation order, dependencies, and milestones for building the FileMom backend.

---

## Project Structure

```
filemom/
├── packages/
│   └── engine/                    # Core backend library
│       ├── src/
│       │   ├── scanner.ts         # File discovery
│       │   ├── extractor.ts       # Metadata extraction
│       │   ├── indexer.ts         # SQLite operations
│       │   ├── watcher.ts         # File change detection
│       │   ├── ai.ts              # Claude integration
│       │   ├── executor.ts        # File operations
│       │   ├── transaction.ts     # Undo/rollback
│       │   ├── embeddings.ts      # Phase 2: semantic search
│       │   ├── config.ts          # Configuration management
│       │   ├── errors.ts          # Error types
│       │   ├── types.ts           # TypeScript types
│       │   ├── utils/
│       │   │   ├── hash.ts        # xxHash utilities
│       │   │   ├── path.ts        # Path normalization
│       │   │   └── fs.ts          # File system helpers
│       │   └── index.ts           # Public API
│       ├── tests/
│       │   ├── scanner.test.ts
│       │   ├── extractor.test.ts
│       │   ├── indexer.test.ts
│       │   ├── executor.test.ts
│       │   └── integration/
│       │       └── e2e.test.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   └── cli/                       # Development CLI
│       ├── src/
│       │   ├── index.ts           # Entry point
│       │   ├── commands/
│       │   │   ├── init.ts
│       │   │   ├── scan.ts
│       │   │   ├── search.ts
│       │   │   ├── plan.ts
│       │   │   ├── execute.ts
│       │   │   ├── undo.ts
│       │   │   └── status.ts
│       │   └── utils/
│       │       ├── output.ts      # Pretty printing
│       │       └── config.ts      # CLI config
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md
│   ├── SCHEMAS.md
│   ├── API.md
│   └── IMPLEMENTATION.md
│
├── package.json                   # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .env.example
```

---

## Dependencies

### Engine Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "better-sqlite3": "^11.0.0",
    "chokidar": "^3.6.0",
    "exifreader": "^4.14.0",
    "fast-glob": "^3.3.2",
    "fs-extra": "^11.2.0",
    "mammoth": "^1.6.0",
    "pdf-parse": "^1.1.1",
    "xxhash-wasm": "^1.0.2",
    "zod": "^3.22.0",
    "p-limit": "^5.0.0",
    "p-retry": "^6.2.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0",
    "memfs": "^4.6.0"
  }
}
```

### CLI Dependencies

```json
{
  "dependencies": {
    "@filemom/engine": "workspace:*",
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "inquirer": "^9.2.0",
    "dotenv": "^16.4.0"
  }
}
```

---

## Implementation Phases

### Phase 0: Project Setup (Day 1)

**Goal:** Working TypeScript monorepo with build tooling.

#### Tasks

- [x] Initialize pnpm workspace
- [x] Set up TypeScript configuration
- [x] Configure Vitest for testing
- [x] Set up ESLint + Prettier (see Decision 13)
- [x] Create package.json files
- [x] Create placeholder source files
- [x] Verify build works: `pnpm build`
- [x] Verify tests work: `pnpm test`

#### Deliverables

- Monorepo structure created
- `pnpm build` produces output
- `pnpm test` runs (empty tests pass)

---

### Phase 1: Scanner + Extractor (Days 2-3)

**Goal:** Can scan folders and extract metadata from files.

#### Tasks

**Scanner (scanner.ts)**
- [ ] Implement `Scanner` class with async iterator
- [ ] Use `fast-glob` for file discovery
- [ ] Skip hidden files (configurable)
- [ ] Skip cloud placeholders (iCloud, OneDrive)
- [ ] Handle permission errors gracefully
- [ ] Emit progress events
- [ ] Add cancellation support
- [ ] Write unit tests with mock filesystem

**Extractor (extractor.ts)**
- [ ] Implement `Extractor` class
- [ ] xxHash implementation for quick hashing
- [ ] EXIF extraction with `exifreader`
- [ ] PDF text extraction with `pdf-parse`
- [ ] DOCX text extraction with `mammoth`
- [ ] Timeout handling per file
- [ ] Error handling (return null metadata, not throw)
- [ ] Write unit tests with sample files

**Utilities**
- [ ] `utils/hash.ts` - xxHash wrapper
- [ ] `utils/path.ts` - Path normalization, validation
- [ ] `utils/fs.ts` - Safe file operations

#### Deliverables

```typescript
// Can run:
const scanner = new Scanner(config);
const files = await scanner.scanAll(['~/Documents']);

const extractor = new Extractor(config);
const metadata = await extractor.extract('/path/to/file.pdf');
```

#### Tests

- Scanner finds files correctly
- Scanner skips hidden files
- Scanner handles permission errors
- Extractor extracts EXIF from JPEG
- Extractor extracts text from PDF
- Extractor extracts text from DOCX
- Extractor handles corrupted files
- Quick hash changes when file changes

---

### Phase 2: Indexer + SQLite (Days 4-5)

**Goal:** Persistent file index with search.

#### Tasks

**Indexer (indexer.ts)**
- [ ] Implement `Indexer` class
- [ ] SQLite database initialization
- [ ] Schema migrations
- [ ] `upsertFile()` - insert or update file record
- [ ] `deleteFile()` - remove file record
- [ ] `getByPath()` - lookup by path
- [ ] `getByHash()` - lookup by quick hash
- [ ] `search()` - FTS5 keyword search
- [ ] `getAllByExtension()` - filter by extension
- [ ] `getRecent()` - recently modified files
- [ ] `getStats()` - index statistics
- [ ] Implement FTS5 triggers for sync
- [ ] Write unit tests

**Integration**
- [ ] Connect Scanner → Extractor → Indexer pipeline
- [ ] Implement `scan()` method on main class
- [ ] Incremental updates (only re-extract changed files)

#### Deliverables

```typescript
// Can run:
const indexer = new Indexer({ dbPath: './test.db' });
await indexer.initialize();
await indexer.upsertFile(fileRecord);
const results = await indexer.search('tax documents');
```

#### Tests

- Database creates tables correctly
- Files insert and update correctly
- FTS5 search returns relevant results
- Incremental scan only processes changed files
- Index survives restart

---

### Phase 3: CLI Foundation (Day 6)

**Goal:** Working CLI for testing the engine.

#### Tasks

- [ ] Set up Commander.js structure
- [ ] Implement `filemom init` command
- [ ] Implement `filemom add <folder>` command
- [ ] Implement `filemom scan` command
- [ ] Implement `filemom status` command
- [ ] Implement `filemom search <query>` command
- [ ] Add progress spinners with `ora`
- [ ] Add colorized output with `chalk`
- [ ] Config file management (~/.filemom/config.json)
- [ ] Environment variable loading

#### Deliverables

```bash
# Can run:
filemom init
filemom add ~/Documents
filemom scan
filemom status
filemom search "tax"
```

---

### Phase 4: Watcher (Day 7)

**Goal:** Real-time file change detection.

#### Tasks

**Watcher (watcher.ts)**
- [ ] Implement `Watcher` class
- [ ] Use `chokidar` with native events
- [ ] Debounce rapid changes (100ms)
- [ ] Verify changes with quick hash (filter false positives)
- [ ] Batch updates (process every 5 seconds)
- [ ] Handle watched folder removal
- [ ] Emit events for UI consumption
- [ ] Integration with Indexer

#### Deliverables

```typescript
// Can run:
const watcher = new Watcher(config);
watcher.on('file:created', (path) => console.log('New file:', path));
await watcher.start();
```

---

### Phase 5: AI Interface (Days 8-9)

**Goal:** Natural language → action plan via Claude.

#### Tasks

**AI Interface (ai.ts)**
- [ ] Implement `AIInterface` class
- [ ] Anthropic SDK integration
- [ ] System prompt construction
- [ ] User prompt template
- [ ] File index serialization (for Claude context)
- [ ] Pre-filtering logic (keyword extraction, FTS search)
- [ ] JSON schema for structured output
- [ ] Zod validation of response
- [ ] Retry logic with exponential backoff
- [ ] Error handling (rate limits, timeouts)
- [ ] Token estimation (don't exceed limits)

**CLI Integration**
- [ ] Implement `filemom plan <command>` command
- [ ] Display action plan nicely
- [ ] Confirmation prompt

#### Deliverables

```typescript
// Can run:
const ai = new AIInterface(config);
const plan = await ai.generatePlan(
  'organize my Hawaii photos',
  fileIndexEntries
);
```

```bash
# Can run:
filemom plan "organize my downloads by type"
```

#### Tests

- Pre-filter correctly extracts keywords
- Pre-filter returns relevant files
- Claude response validates against schema
- Handles API errors gracefully
- Stays within token limits

---

### Phase 6: Executor + Transaction Log (Days 10-12)

**Goal:** Safe file operations with undo.

#### Tasks

**Transaction Log (transaction.ts)**
- [ ] Implement `TransactionLog` class
- [ ] SQLite table for transactions
- [ ] `record()` - log operation before executing
- [ ] `complete()` - mark as completed
- [ ] `fail()` - mark as failed with error
- [ ] `getBatch()` - get all transactions in batch
- [ ] `getUndoable()` - get batches that can be undone
- [ ] `rollback()` - reverse a batch
- [ ] `cleanupExpired()` - delete old records
- [ ] TTL enforcement

**Executor (executor.ts)**
- [ ] Implement `Executor` class
- [ ] Validate action plan before execution
- [ ] Topological sort for folder creation order
- [ ] Copy-then-delete pattern for moves
- [ ] Handle EXDEV (cross-volume) errors
- [ ] Preserve macOS extended attributes
- [ ] Windows file lock retry logic
- [ ] Name collision handling (add suffix)
- [ ] Parallel execution with concurrency limit
- [ ] Integration with transaction log
- [ ] Update SQLite index after moves

**CLI Integration**
- [ ] Implement `filemom execute <plan.json>` command
- [ ] Implement `filemom undo` command
- [ ] Implement `filemom history` command

#### Deliverables

```typescript
// Can run:
const executor = new Executor(config, transactionLog);
const result = await executor.execute(plan);
await transactionLog.rollback(result.batchId);
```

```bash
# Can run:
filemom plan "organize downloads" --save plan.json
filemom execute plan.json
filemom history
filemom undo
```

#### Tests

- Files move correctly
- Folders create in correct order
- Cross-volume moves work
- Name collisions handled with suffix
- Transaction log records all operations
- Undo reverses operations correctly
- Expired batches cannot be undone

---

### Phase 7: Integration + Polish (Days 13-14)

**Goal:** End-to-end testing, error handling, documentation.

#### Tasks

- [ ] End-to-end integration tests
- [ ] Error message improvements
- [ ] Edge case handling review
- [ ] Performance testing (10K files)
- [ ] Memory usage profiling
- [ ] Documentation review
- [ ] README.md for packages
- [ ] Example scripts

#### Tests

Full E2E flow:
1. Initialize with empty database
2. Add folders
3. Scan (verify index populated)
4. Search (verify results)
5. Generate plan (verify actions)
6. Execute plan (verify files moved)
7. Undo (verify files restored)

---

## Phase 2: Semantic Search (Future)

### Tasks

**Embeddings (embeddings.ts)**
- [ ] Transformers.js integration
- [ ] LanceDB setup
- [ ] Embedding generation pipeline
- [ ] Semantic search integration
- [ ] Update pre-filter to use embeddings

**Claude Vision Integration**
- [ ] Image analysis for photos without EXIF
- [ ] Cost management (only when needed)

---

## Milestones

| Milestone | Description | Target |
|-----------|-------------|--------|
| M1 | Scanner + Extractor working | Day 3 |
| M2 | SQLite index with search | Day 5 |
| M3 | CLI can scan and search | Day 6 |
| M4 | Watcher detects changes | Day 7 |
| M5 | AI generates action plans | Day 9 |
| M6 | Executor moves files safely | Day 12 |
| M7 | Undo works correctly | Day 12 |
| M8 | Integration tests pass | Day 14 |
| M9 | Ready for Electron integration | Day 14 |

---

## Testing Strategy

### Unit Tests (per component)

Each component has isolated unit tests:

```typescript
// scanner.test.ts
describe('Scanner', () => {
  it('finds all files in directory');
  it('skips hidden files when configured');
  it('skips iCloud placeholder files');
  it('handles permission errors gracefully');
  it('emits progress events');
  it('can be cancelled');
});
```

### Integration Tests

Test component interactions:

```typescript
// integration/pipeline.test.ts
describe('Indexing Pipeline', () => {
  it('scans, extracts, and indexes files');
  it('updates index on file changes');
  it('handles concurrent modifications');
});
```

### E2E Tests

Full workflow tests:

```typescript
// integration/e2e.test.ts
describe('End to End', () => {
  it('completes full organize workflow');
  it('undoes operations correctly');
  it('recovers from partial failures');
});
```

### Manual Testing Checklist

- [ ] Scan 1,000 files - completes in < 1 min
- [ ] Scan 10,000 files - completes in < 3 min
- [ ] Search returns results in < 100ms
- [ ] AI plan generation < 10 seconds
- [ ] File moves work on same volume
- [ ] File moves work across volumes
- [ ] Undo restores files to original locations
- [ ] Watcher detects new files
- [ ] Watcher detects modified files
- [ ] Watcher detects deleted files
- [ ] Works on macOS
- [ ] Works on Windows
- [ ] Works on Linux

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| pdf-parse fails on some PDFs | Graceful fallback, log warning |
| exifreader fails on some images | Graceful fallback, log warning |
| Claude returns invalid JSON | Zod validation, retry once |
| File locked during move | Retry with backoff, fail gracefully |
| Database corruption | WAL mode, regular backups |
| Large file index crashes | Pagination, streaming where possible |

---

## Definition of Done

A feature is done when:

1. Code is written and passes lint
2. Unit tests written and passing
3. Integration tests (if applicable) passing
4. Documentation updated
5. Code reviewed (self-review for solo work)
6. Manual testing completed
7. Edge cases handled
8. Error messages are user-friendly

---

## Next Steps After Backend

1. **Electron Integration** - Wire engine to Electron main process
2. **React UI** - Chat interface, confirmation dialogs
3. **Settings UI** - Folder management, preferences
4. **Auto-update** - electron-updater integration
5. **Code signing** - macOS notarization, Windows EV cert
6. **Beta testing** - Recruit 5-10 non-technical users
