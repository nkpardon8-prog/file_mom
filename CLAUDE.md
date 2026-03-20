# CLAUDE.md — FileMom / OrgOrg

## Project Overview
AI-powered file organization engine. Monorepo with `packages/engine` (core) and `apps/cli`.

## Tech Stack
- TypeScript 5.9+, Node 20+, pnpm monorepo
- SQLite (better-sqlite3) with FTS5 full-text search
- Vitest for testing
- Zod for schema validation

## Pipeline (Phases 0-2 implemented)
```
Scanner (fast-glob) → Extractor (EXIF/PDF/DOCX) → Indexer (SQLite + FTS5)
```
Orchestrated by `FileMom` class in `packages/engine/src/filemom.ts`.

## Key Commands
- `pnpm test` — run all tests
- `pnpm build` — build all packages

## Testing Patterns
- Scanner tests: real filesystem (mkdtemp/writeFile)
- Extractor tests: vi.mock for ExifReader, PDFParse, mammoth; real files for hash
- Indexer tests: file-backed SQLite in temp directory
- Integration: filemom.test.ts uses real Scanner+Indexer, real Extractor (no mocks)

## Bugs Found & Fixed (2026-03-18)

### Bug A: FTS5 query injection in `_sanitizeQuery`
- **File**: `packages/engine/src/indexer.ts:265`
- **Issue**: Did not handle FTS5 keywords (OR, AND, NOT, NEAR), column filters (:), or backslash
- **Fix**: Strip additional chars, remove FTS5 operator tokens, double-quote remaining tokens

### Bug B: Extractor returns empty hash for skipped extensions
- **File**: `packages/engine/src/extractor.ts:36`
- **Issue**: Skipped-extension files got `quickHash: ''`, polluting `getByHash('')`
- **Fix**: Compute hash even on skip path (only content extraction is skipped)

### Bug C: ConfigSchema skipExtensions default mismatch
- **File**: `packages/engine/src/config.ts:13`
- **Issue**: Schema default `[]` vs DEFAULT_CONFIG `['exe', 'dll', 'so', 'dylib', 'bin']`
- **Fix**: Updated schema default to match

### Bug D: Hash lost on extraction error (2026-03-19)
- **File**: `packages/engine/src/extractor.ts:62-78`
- **Issue**: When PDF/DOCX extraction throws or times out, catch block returned `quickHash: ''`, discarding the already-computed hash. Same class of pollution as Bug B.
- **Fix**: Compute hash before `withTimeout` wrapper and pass it to `_extractInternal`. Hash is now preserved in the error path.

### Bug E: `excludePatterns` schema default mismatch + `**/.*` conflict (2026-03-19)
- **File**: `packages/engine/src/config.ts:8, 35-42`
- **Issue 1**: Schema default `[]` vs DEFAULT_CONFIG's exclude list — users got no exclusions, indexing `.git`, `node_modules`, etc.
- **Issue 2**: `**/.*` in DEFAULT_CONFIG overrides `includeHidden: true` (fast-glob applies ignore after dot)
- **Fix**: Set schema default to `['**/node_modules/**', '**/.git/**', '**/*.tmp', '**/Thumbs.db', '**/.DS_Store']`, removed `**/.*` from both

### Bug F: `getStats()` returns current time for empty database (2026-03-19)
- **File**: `packages/engine/src/indexer.ts:286-287`
- **Issue**: `oldestFile`/`newestFile` returned `new Date()` (now) when no files exist — misleading in CLI output
- **Fix**: Changed to `new Date(0)` (epoch) as clear "no data" sentinel

### Phase A Fixes (2026-03-19)
- **safeCopy comment**: Fixed misleading COPYFILE_EXCL comment in `utils/fs.ts`
- **LIKE escaping**: Added `_escapeLike()` to Indexer, fixed `searchByPath` and folder filter SQL injection of `%`/`_` wildcards
- **Deleted file detection**: `scan()` now detects files removed from disk and deletes them from the index. Added `getPathsInFolder()` to Indexer.
- **watchedFolders in getStats**: `FileMom.getStats()` now populates `watchedFolders` with per-folder file counts from config. Added `getFileCountInFolder()` to Indexer.
- **Transaction tests**: New `transaction.test.ts` with 14 tests covering full TransactionLog API (lifecycle, CRUD, LIFO order, TTL, undo, rollback, expiry)

### Phase D: Embeddings / Semantic Search (2026-03-19)
- **Embeddings class**: Full rewrite from LanceDB stub → sqlite-vec + Transformers.js (`all-MiniLM-L6-v2`, 384-dim)
- **sqlite-vec integration**: `vec0` virtual table for vector KNN search. Key finding: requires `BigInt` for rowid params with better-sqlite3.
- **Hybrid search**: `hybridSearch()` combines FTS5 BM25 (0.3 weight) + vector cosine similarity (0.7 weight)
- **FileMom methods**: `embedFiles()`, `semanticSearch()`, `_buildEmbeddingText()` (combines name + text + vision + tags)
- **Indexer V2 migration**: Creates `file_embeddings` vec0 table. Added `getById()`, `getUnembedded()`, delete cascade to file_embeddings.
- **CLI**: `--semantic` flag on search command, `--embed` flag on scan command
- **Fixed**: e2e test LanceDB config reference, Watcher e2e incomplete config, SCHEMAS.md outdated comment

### Phase C: File System Watcher (2026-03-19)
- **Watcher**: Full chokidar v5 implementation in `watcher.ts` — `start()`, `stop()`, `onEvent()`, `offEvent()`, `isWatching`
- **FileMom integration**: `startWatching(onEvent?)`, `stopWatching()`, `_handleWatchEvent()` — auto indexes created/modified/deleted files
- **CLI `watch` command**: Real-time file change display with timestamps, Ctrl+C graceful shutdown
- **WatcherError**: New error class (recoverable) for watcher-specific errors
- **Pattern filtering**: Custom `_isExcluded()` method handles glob patterns against absolute paths (chokidar's picomatch doesn't match globs on absolute paths)

### Phase B: CLI Tests (2026-03-19)
- Added vitest to `apps/cli` package with 3 test files:
  - `output.test.ts` (14 tests): formatSize, printScanResult, printSearchResults, printActionPlan, printStats, printCost
  - `config.test.ts` (10 tests): loadConfig merge logic, env overrides, corrupt file handling, readStoredConfig, saveConfig
  - `commands.test.ts` (22 tests): all 9 commands (init, add, scan, search, status, plan, enrich, execute, undo) with mocked FileMom, config, inquirer, ora

## Test Coverage Expansion (2026-03-18)
Added ~65 new tests covering:
- Scanner: multi-folder, special chars, no-extension, deep nesting, symlinks
- Extractor: DOCX truncation, partial EXIF, uppercase extensions, concurrent extraction
- Hash: 4KB boundary, binary content, non-existent files
- Indexer: FTS5 special chars, size/date filters, combined filters, edge cases
- Config: boundary values for all numeric fields
- Path: empty string, trailing slash, escape attempts
- Integration: Scanner→Extractor→Indexer pipeline end-to-end
