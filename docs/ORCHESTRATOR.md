# FileMom Orchestrator

> **This is a living document.** Update it as new phases are implemented.

The `FileMom` class is the main entry point for consumers (CLI, Electron app, tests). It coordinates the pipeline between Scanner, Extractor, Indexer, and future components (AI Interface, Executor, TransactionLog).

---

## Current State

**Implemented:** Phase 1-2 methods (scan, search, getStats, getFile)

| Method | Phase | Status |
|--------|-------|--------|
| `scan()` | 1-2 | Implemented |
| `search()` | 2 | Implemented |
| `getStats()` | 2 | Implemented |
| `getFile()` | 2 | Implemented |
| `plan()` | 5 | TODO |
| `refinePlan()` | 5 | TODO |
| `execute()` | 6 | TODO |
| `undo()` | 6 | TODO |
| `getUndoableBatches()` | 6 | TODO |

---

## Data Flow

```
FileMomConfig
    │
    ├──► Scanner (excludePatterns, includeHidden, followSymlinks)
    │       │
    │       ▼
    │    ScannedFile (path, name, ext, size, mtime, ctime)
    │       │
    ├──► Extractor (maxTextLength, timeoutMs, skipExtensions)
    │       │
    │       ▼
    │    ExtractedMetadata (quickHash, extractedText, exif, error)
    │       │
    │       ▼
    │    _buildRecord() ◄── Combines ScannedFile + ExtractedMetadata
    │       │                Serializes ExifData → JSON string
    │       ▼
    │    FileRecord (16 fields, ready for database)
    │       │
    └──► Indexer (dbPath)
            │
            ▼
         SQLite (files table + FTS5 + sqlite-vec)
            │
            ▼
         SearchResult / IndexStats
```

---

## The `_buildRecord` Bridge

This is the key transformation that was missing before the orchestrator existed. It combines output from two separate components into a single database record:

```
ScannedFile fields:          ExtractedMetadata fields:
  path ─────────────────►     quickHash ──────────────►
  name ─────────────────►     extractedText ──────────►
  extension ────────────►     exif ──► JSON.stringify() ──► exifJson
  size ─────────────────►     extractionError (logged, not stored)
  mtime ────────────────►
  ctime ────────────────►

Auto-generated:
  id = 0 (SQLite auto-increment)
  indexedAt = Date.now()
  embeddingId = null (Phase 2.5)
  visionDescription = null (Phase 1.5)
  visionCategory = null (Phase 1.5)
  visionTags = null (Phase 1.5)
  enrichedAt = null (Phase 1.5)
```

---

## Incremental Scan Logic

On subsequent scans, `scan()` compares each file against the existing index:

```
For each ScannedFile:
  existing = indexer.getByPath(path)

  if existing AND mtime matches AND size matches:
    → SKIP (unchanged, no re-extraction needed)

  if existing but mtime/size differ:
    → UPDATE (re-extract, count as updatedFiles)

  if not in index:
    → NEW (extract, count as newFiles)
```

This avoids re-extracting metadata for unchanged files, which is the most expensive operation in the pipeline.

Use `scan({ fullRescan: true })` to force re-extraction of all files.

---

## Batch Processing

Files are indexed in batches of 100 to balance memory usage and database performance:

```
scan loop:
  collect records into batch[]
  when batch.length >= 100:
    indexer.upsertFiles(batch)  ← runs in SQLite transaction
    batch.length = 0
  flush remaining at end
```

`upsertFiles()` uses a prepared statement + `db.transaction()` for ~100K inserts/sec throughput.

---

## Configuration Mapping

`FileMomConfig` is split into sub-component configs:

```
FileMomConfig
  ├─► ScannerConfig
  │     excludePatterns ← config.excludePatterns
  │     includeHidden   ← config.includeHidden
  │     followSymlinks  ← config.followSymlinks
  │
  ├─► ExtractorConfig
  │     maxTextLength   ← config.maxTextLength
  │     timeoutMs       ← config.extractionTimeoutMs
  │     skipExtensions  ← config.skipExtensions
  │
  ├─► IndexerConfig
  │     dbPath          ← join(config.dataDir, 'index.db')
  │
  ├─► AIInterfaceConfig (TODO: Phase 5)
  │     apiKey          ← config.anthropicApiKey
  │     model           ← config.model
  │     maxFilesPerReq  ← config.maxFilesPerRequest
  │     requestTimeout  ← config.requestTimeoutMs
  │
  └─► ExecutorConfig (TODO: Phase 6)
        maxConcurrent   ← config.maxConcurrentOps
        retryAttempts   ← config.retryAttempts
        retryDelayMs    ← config.retryDelayMs
```

---

## TODO: Update When Implementing

### Phase 1.5: Vision Enrichment
- [ ] Add `enrichFiles()` method that calls VisionEnricher after scan
- [ ] Update `_buildRecord` to accept VisionResult
- [ ] Update scan pipeline to optionally trigger enrichment

### Phase 5: AI Interface
- [ ] Add `plan(command)` method that pre-filters index → calls Claude → returns ActionPlan
- [ ] Add `refinePlan()` for conversational feedback loop
- [ ] Add FileRecord → FileIndexEntry conversion helper

### Phase 6: Executor + Undo
- [ ] Add `execute(plan)` method
- [ ] Add `undo(batchId)` method
- [ ] Add `getUndoableBatches()` method
- [ ] Initialize TransactionLog alongside Indexer

### Phase 4: Watcher
- [ ] Start Watcher in `initialize()`, stop in `shutdown()`
- [ ] On file change events, trigger incremental scan + extract for affected files
