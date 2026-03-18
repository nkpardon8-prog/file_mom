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
| Images | ExifTool (binary) | exifreader (pure JS) |
| PDF | Poppler (binary) | pdf-parse (pure JS) |
| DOCX | Pandoc (binary) | mammoth (pure JS) |

**Choice:** Option B for all — pure JS

**Rationale:**
- No binary dependencies = simpler installation
- Works on all platforms without PATH configuration
- Smaller bundle size (~2MB vs ~190MB with binaries)
- Sufficient for our needs (we need metadata, not advanced processing)

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

**Date:** 2026-03-17

**Decision:** SQLite for metadata, LanceDB for embeddings (Phase 2)

**Options Considered:**
1. SQLite only (with sqlite-vec for vectors)
2. SQLite + LanceDB
3. SQLite + Orama (in-memory)

**Choice:** Option 2

**Rationale:**
- SQLite is battle-tested, great tooling, perfect for metadata
- LanceDB is purpose-built for vectors, disk-based performance
- Clear separation of concerns
- Both are embedded (no server process)
- sqlite-vec is newer, less mature

**Schema Split:**
- `files` table in SQLite (all metadata, FTS5 search)
- `embeddings` collection in LanceDB (vectors only, Phase 2)

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

## Future Decisions (To Be Made)

- [ ] Electron IPC protocol (direct vs message passing)
- [ ] Auto-update mechanism (Squirrel vs custom)
- [ ] Telemetry/analytics approach
- [ ] Subscription billing integration
- [ ] Offline mode scope
