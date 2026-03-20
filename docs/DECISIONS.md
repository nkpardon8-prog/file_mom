# Technical Decisions Log

This document records key technical decisions made during planning, with rationale.

---

## Decision 1: Build from Scratch vs Fork aifiles

**Date:** 2026-03-17

**Decision:** Build from scratch

**Options Considered:**
1. Fork aifiles npm package
2. Build fresh with selected dependencies

**Choice:** Option 2 — Build from scratch

**Rationale:**
- aifiles doesn't provide native extraction (shells to ExifTool, Poppler, Pandoc)
- We need pure JS for easy installation (no binary dependencies)
- aifiles has 1 download/week (low adoption, potential issues)
- Core file operations are simple (~200 lines)
- Building fresh is actually faster than understanding/stripping aifiles

**Consequences:**
- Full control over architecture
- No fork maintenance burden
- Must implement scanner, watcher, executor ourselves (but these are straightforward)

---

## Decision 2: Metadata Extraction Libraries

**Date:** 2026-03-17

**Decision:** Pure JavaScript libraries only

**Options Considered:**
| File Type | Option A | Option B |
|-----------|----------|----------|
| File Type | Option A | Option B (chosen) |
|-----------|----------|----------|
| Images | ExifTool (binary) | exifr (pure JS, 4x faster than exifreader) |
| PDF | Poppler (binary) | unpdf (pure JS, maintained, uses PDF.js v5.4) |
| DOCX | Pandoc (binary) | mammoth (pure JS) |
| Audio | FFmpeg (binary) | music-metadata (pure JS, 23+ formats) |

**Choice:** Option B for all — pure JS

**Rationale:**
- No binary dependencies = simpler installation
- Works on all platforms without PATH configuration
- Smaller bundle size (~2MB vs ~190MB with binaries)
- Sufficient for our needs (we need metadata, not advanced processing)

**Updates (2026-03-18):**
- Replaced `exifreader` with `exifr` — 4x faster (2.5ms vs 9.5ms per image), zero deps, flat API
- Replaced `pdf-parse` with `unpdf` — actively maintained by UnJS team, no constructor/destroy lifecycle
- Added `music-metadata` — audio metadata extraction (artist, album, genre, duration)
- Added `file-type` — MIME-type detection via magic bytes for correct extractor routing

**Trade-offs:**
- May not handle every edge case that native tools handle
- Slightly slower for large files

---

## Decision 3: File Hashing Strategy

**Date:** 2026-03-17

**Decision:** xxHash partial (first 4KB + file size)

**Options Considered:**
1. Full SHA-256 hash
2. Full xxHash
3. Partial xxHash (first 4KB + size)

**Choice:** Option 3

**Rationale:**
- Change detection doesn't need cryptographic security
- xxHash is ~10x faster than SHA-256
- Partial hashing is ~100x faster for large files
- First 4KB + size catches 99.9% of changes
- Full hash only needed for deduplication (future feature)

**Implementation:**
```typescript
quickHash = xxhash64(first4KB) + '-' + fileSize
```

---

## Decision 4: Database Architecture

**Date:** 2026-03-17 (Updated: 2026-03-18)

**Decision:** SQLite for everything — metadata, FTS5 search, and vector embeddings via sqlite-vec

**Options Considered:**
1. SQLite only (with sqlite-vec for vectors)
2. SQLite + LanceDB
3. SQLite + Orama (in-memory)

**Choice:** Option 1 — SQLite with sqlite-vec

**Rationale:**
- SQLite is battle-tested, great tooling, perfect for metadata
- sqlite-vec adds vector search to the same database (~200KB extension)
- Single database file — no second storage engine to manage
- Sufficient performance for brute-force KNN on <100K vectors
- Smaller bundle size than LanceDB (200KB vs 20-40MB)
- Simpler architecture: all data in one place, one backup, one migration path

**Schema:**
- `files` table in SQLite (all metadata, FTS5 search)
- `file_embeddings` virtual table via sqlite-vec (384-dim vectors, same DB)

---

## Decision 5: Initial Scan UX

**Date:** 2026-03-17

**Decision:** Staged scanning (quick → deep)

**Options Considered:**
1. Blocking full scan
2. Background scan (user waits)
3. Staged scan (quick results → background enhancement)

**Choice:** Option 3

**Rationale:**
- Non-technical users expect instant feedback
- Quick scan (path, name, size, mtime) takes ~10-30 seconds for 10K files
- User can start searching immediately
- Deep extraction (PDF text, EXIF) happens in background
- Similar to macOS Spotlight behavior

**Implementation:**
```
Phase 1 (blocking):  path, name, extension, size, mtime (~30 sec for 10K)
Phase 2 (background): EXIF, PDF text, DOCX text (~3 min for 10K)
Phase 3 (background): embeddings (~5 min for 10K)
```

---

## Decision 6: Embedding Strategy

**Date:** 2026-03-17

**Decision:** Hybrid (local text + API for images)

**Options Considered:**
1. Gemini Embedding API only
2. Transformers.js only (local)
3. Hybrid approach

**Choice:** Option 3

**Rationale:**
- Transformers.js for text is free and works offline
- Most file organization works on filenames alone
- Claude Vision only for photos without useful EXIF/filename
- Minimizes API costs while maximizing offline capability

**Implementation:**
- Text: `all-MiniLM-L6-v2` via Transformers.js (384 dimensions)
- Images: Claude Vision API (only when needed)

---

## Decision 7: File Move Strategy

**Date:** 2026-03-17

**Decision:** Always copy-then-delete, never fs.rename()

**Options Considered:**
1. Use `fs.rename()` when possible, fallback to copy+delete
2. Always copy-then-delete

**Choice:** Option 2

**Rationale:**
- `fs.rename()` fails across volumes (EXDEV error)
- `fs.rename()` is atomic but not recoverable
- Copy-then-delete allows verification before delete
- Enables recovery if process crashes mid-operation
- Transaction log can restore from copy state

**Implementation:**
```typescript
async function moveFile(src, dest) {
  await fs.copyFile(src, dest);
  await verifyIdentical(src, dest);  // Compare size/hash
  await fs.unlink(src);
}
```

---

## Decision 8: CLI for Development

**Date:** 2026-03-17

**Decision:** Build a CLI alongside the engine

**Rationale:**
- Faster iteration than testing through Electron
- Validates API design (if CLI is awkward, API is awkward)
- Enables CI/CD testing in headless environments
- Useful for demos before UI is ready
- Can dogfood the tool during development

**Scope:**
- Thin wrapper around engine API
- Commands: init, scan, search, plan, execute, undo, status
- JSON output mode for scripting
- Will NOT be shipped to end users

---

## Decision 9: Project Structure

**Date:** 2026-03-17

**Decision:** Monorepo with single engine package

**Options Considered:**
1. Separate npm packages per component
2. Single `/engine` folder
3. Monorepo with engine + cli packages

**Choice:** Option 3

**Rationale:**
- Engine is isolated, testable, reusable
- CLI validates the API
- Desktop app (future) uses same engine
- Not over-engineered with per-component packages
- pnpm workspaces for simple dependency management

**Structure:**
```
packages/
  engine/     # Core library
apps/
  cli/        # Dev CLI
  desktop/    # Future Electron app
```

---

## Decision 10: Undo Window

**Date:** 2026-03-17

**Decision:** 30-minute TTL for undo operations

**Options Considered:**
1. Permanent history (never expire)
2. Session-based (clear on app close)
3. Time-based TTL (30 minutes)

**Choice:** Option 3

**Rationale:**
- Permanent history = storage bloat, privacy concerns
- Session-based = too short, user might not notice mistake
- 30 minutes = reasonable window to catch mistakes
- Matches user mental model ("just did it, can undo")
- Clear TTL enables automatic cleanup

**Implementation:**
- `expires_at` column in transactions table
- Background cleanup job every 5 minutes
- UI shows remaining undo time

---

## Decision 11: Concurrency Limits

**Date:** 2026-03-17

**Decision:** 20 parallel file operations

**Research:**
- Node.js can handle many more, but disk I/O is the bottleneck
- Too few = slow, too many = disk thrashing
- 20 is a common sweet spot for local file operations
- Matches chokidar's internal limits

**Implementation:**
```typescript
import pLimit from 'p-limit';
const limit = pLimit(20);

await Promise.all(
  files.map(f => limit(() => processFile(f)))
);
```

---

## Decision 12: Claude Model Selection

**Date:** 2026-03-17

**Decision:** Claude Sonnet 4 as default

**Options:**
| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| Haiku | Fast | Good | Low |
| Sonnet | Medium | Great | Medium |
| Opus | Slow | Best | High |

**Choice:** Sonnet (default), configurable

**Rationale:**
- Sonnet balances speed and quality well
- File organization doesn't need Opus-level reasoning
- Users can downgrade to Haiku for lower costs
- Structured output works well on all models

---

## Decision 13: ESLint + Prettier in Phase 0

**Date:** 2026-03-17

**Decision:** Include ESLint + Prettier from day one with minimal config

**Options Considered:**
1. Include in Phase 0
2. Defer to Phase 1 or later

**Choice:** Option 1

**Rationale:**
- Explicitly listed as a Phase 0 task in IMPLEMENTATION.md
- Pre-filling types.ts, errors.ts, and config.ts with real code means formatting consistency matters from the first commit
- Modern ESLint 9+ flat config + typescript-eslint is low-friction to set up
- Cost of adding later = reformatting all existing files + potential inconsistencies in early code

**Setup:**
- ESLint 10 with flat config (`eslint.config.js`)
- `typescript-eslint` for TS-aware linting rules
- `eslint-config-prettier` to disable ESLint rules that conflict with Prettier
- Prettier with standard config (single quotes, trailing commas, 100-char width)

---

## Decision 14: Dependency Version Strategy

**Date:** 2026-03-17

**Decision:** Use latest versions for all dependencies, except Zod (pinned to v3.x)

**Rationale:**
- Latest versions get the most recent bug fixes and performance improvements
- `^` ranges allow automatic patch/minor updates within the same major version
- Zod was pinned to v3.x because all schema definitions in SCHEMAS.md were written for the Zod 3 API; Zod 4 introduced breaking changes that would require rewriting schemas with no functional benefit

**Key version differences from original spec:**
| Package | Spec Version | Actual Version | Notes |
|---------|-------------|---------------|-------|
| better-sqlite3 | ^11.0.0 | ^12.8.0 | API compatible |
| chokidar | ^3.6.0 | ^5.0.0 | New API — only matters at Phase 4 |
| zod | ^3.22.0 | ^3.24.0 | Kept on v3 intentionally |
| vitest | ^1.4.0 | ^4.1.0 | API compatible |
| p-limit | ^5.0.0 | ^6.2.0 | Only used in Phase 6 |

---

## Decision 15: Smart Folder Guided Workflow

**Date:** 2026-03-18

**Decision:** Add a "Create Folder with AI" button-driven flow alongside the existing freeform command interface

**Rationale:**
- A button is more discoverable than a blank text box for non-technical users
- The preview-and-confirm loop catches mistakes *before* moving files, reducing reliance on undo
- Each Claude API call is small (3-5 sample files vs 500), making it faster and cheaper
- The conversation is bounded (2-3 rounds), not open-ended — easy to build and test
- Sits alongside the existing `plan()`/`execute()` flow without replacing it

**Architecture:**
- Builds on existing components: `Indexer.search()` for sampling, `AIInterface` for folder naming, `Executor` for moves
- New `SmartFolderSession` class orchestrates the multi-turn flow
- New `Indexer.sampleFiles()` method returns diverse representative files
- Refinement logic parses user feedback ("not receipts") into search exclusions
- Implementation spread across Phases 2, 5, and 7 to align with component readiness

**Trade-offs:**
- Adds a parallel workflow path (more code surface to maintain)
- Multi-turn state management is slightly more complex than single-shot plan
- Worth it because it's fundamentally more user-friendly for the target audience

---

## Decision 16: Keep fast-glob (Not Replacing with tinyglobby)

**Date:** 2026-03-18

**Decision:** Keep `fast-glob` as the glob library

**Options Considered:**
1. Keep fast-glob
2. Switch to tinyglobby (smaller, faster for non-streaming use)

**Choice:** Option 1

**Rationale:**
- Scanner relies on `fg.globStream()` with `{ stats: true }` to get file metadata in a single pass
- Scanner uses `fg.convertPathToPattern()` for safe path escaping
- tinyglobby does not support streaming mode or stats collection
- Replacing fast-glob would require separate `fs.lstat()` calls per file, degrading scan performance

**Consequences:**
- Slightly larger bundle than tinyglobby (~40KB difference)
- No changes needed to scanner.ts

---

## Decision 17: MIME-Type Detection with file-type

**Date:** 2026-03-18

**Decision:** Add `file-type` library for content-based MIME detection in the extractor

**Rationale:**
- Extractor previously dispatched purely by file extension — misnamed files routed to wrong extractor
- `file-type` reads magic bytes (first few bytes) to detect actual content type
- MIME detection takes priority; extension is the fallback when file-type returns null
- Adds `detectedMimeType` field to `ExtractedMetadata` for downstream consumers

**Consequences:**
- Files with wrong extensions are now correctly processed (e.g., a PDF renamed to .jpg)
- Tiny overhead per file (reads first few bytes, very fast)
- New `detectedMimeType` field in ExtractedMetadata type

---

## Decision 18: Audio Metadata as Formatted Text

**Date:** 2026-03-18

**Decision:** Store audio metadata as a formatted text string in `extractedText` rather than a separate structured field

**Format:** `"Artist: X | Album: Y | Title: Z | Year: N | Genre: G | Duration: M:SS"`

**Rationale:**
- Puts audio metadata into FTS5 full-text search index automatically (no schema changes)
- Users can search for "Radiohead" or "Alternative Rock" and find matching audio files
- Avoids adding `audioMetadata` field to ExtractedMetadata which would cascade to DB schema, indexer, etc.
- Structured audio data can be added later as a separate enrichment field if needed

**Consequences:**
- Audio files are now searchable by artist, album, title, genre, year
- No database schema migration required
- Trade-off: audio metadata is not individually queryable (e.g., can't filter by year range)

---

## Decision 19: OpenRouter as AI Provider

**Date:** 2026-03-18

**Decision:** Use OpenRouter via OpenAI SDK instead of Anthropic SDK directly

**Options Considered:**
1. Anthropic SDK direct (single provider)
2. OpenRouter via OpenAI SDK (multi-provider, single key)
3. OpenRouter via plain fetch (no SDK)

**Choice:** Option 2

**Rationale:**
- Single API key for all models (Claude, Gemini, GPT-4o)
- OpenAI SDK handles retries, timeouts, streaming natively
- Model switching requires changing a config string, not an SDK
- Tool calling tested and confirmed working
- `usage.cost` in responses enables budget tracking
- Confirmed model IDs: `anthropic/claude-sonnet-4` ($3/$15/M), `anthropic/claude-haiku-4.5` ($1/$5/M), `google/gemini-2.5-flash` ($0.30/$2.50/M)

**Consequences:**
- Replaced @anthropic-ai/sdk with openai SDK
- Config changed from `anthropicApiKey` to `openRouterApiKey`
- Model strings use OpenRouter format: `provider/model-name`
- `strict: true` not used (not confirmed by OpenRouter docs) — Zod validation is the safety net
- Action IDs relaxed from UUID to any string (models don't reliably generate UUIDs)

---

## Decision 20: Qwen VL for Vision Enrichment

**Date:** 2026-03-19

**Decision:** Use `qwen/qwen-2.5-vl-7b-instruct` via OpenRouter for vision enrichment instead of Claude Vision

**Rationale:**
- ~100x cheaper than Claude Haiku ($0.20/M vs $1/$5 per M tokens)
- Good enough quality for file description/categorization/tagging
- Available through the same OpenRouter API — no additional SDK needed
- Tested: returns accurate descriptions, categories, and tags

**Consequences:**
- Uses JSON response mode instead of tool calling (Qwen VL doesn't support tools on OpenRouter)
- Category is a flexible string (not enum) since models return free-form categories like "logo"
- Cost per image: ~$0.0003

---

## Decision 21: AI-Powered Query Expansion in Pre-Filter

**Date:** 2026-03-19

**Decision:** Add a cheap AI call before the FTS5 search step that expands the user's command into multiple keywords, folder patterns, and extension filters

**Rationale:**
- Raw FTS5 keyword search only finds literal string matches
- Users think in terms of projects ("plan2bid files") not exact filenames
- A single cheap AI call (~$0.001) dramatically improves file discovery
- The expansion model sees the actual folder structure and can infer related terms

**Architecture:**
1. `expandQuery()` sends user command + top folders + index stats to AI
2. AI returns: keywords, folderPatterns, extensions, reasoning
3. Multi-query search: each keyword searched via FTS5 + folder patterns matched via LIKE
4. Results merged, deduplicated, capped at maxFilesPerRequest
5. Expanded context passed to plan generation as before

**Consequences:**
- One additional API call per plan (~$0.001 with Haiku)
- Better file discovery for project-level and contextual commands
- Expansion results shown to user in CLI for transparency

---

## Decision 22: Executor — Copy-Then-Delete with Transaction Log

**Date:** 2026-03-19

**Decision:** All file moves use copy-then-delete (never fs.rename), with every operation recorded to a SQLite transaction log before execution

**Rationale:**
- `fs.rename()` fails across volumes (SSD → external drive) — copy-then-delete works everywhere
- Recording BEFORE execution means partial failures are recoverable
- LIFO rollback enables undo within a configurable TTL window (30 min default)
- Copy verification (size check) catches corruption before deleting the source
- Name collision handling with `(1)`, `(2)` suffixes prevents overwrites

**Architecture:**
- `Executor`: topological sort (folders first by depth), parallel file ops with p-limit
- `TransactionLog`: SQLite tables (`batches` + `transactions`), shares the index.db file
- `safeCopy()`: copyFile + size verification + parent directory creation
- `resolveCollision()`: checks if destination exists, tries suffixed names up to (999)

**Consequences:**
- Moves are slower than rename (copy + delete vs atomic rename) but safer
- Undo window limited to TTL (expired batches can't be undone)
- Transaction log grows over time — `cleanupExpired()` purges old records

---

## Future Decisions (To Be Made)

- [ ] Electron IPC protocol (direct vs message passing)
- [ ] Auto-update mechanism (Squirrel vs custom)
- [ ] Telemetry/analytics approach
- [ ] Subscription billing integration
- [ ] Offline mode scope
