# FileMom Web UI — Implementation Plan

This document defines the phased implementation of the FileMom web application. Each phase is self-contained, testable, and builds on the previous one. The API layer (Fastify/Node.js) wraps the existing FileMom engine directly — no rewriting.

---

## Architecture Overview

```
apps/web/          → React + Vite (frontend, port 3000)
apps/api/          → Fastify + WebSocket (backend, port 4000)
packages/engine/   → FileMom engine (imported directly by API)
```

The API server imports `FileMom`, `Indexer`, `Embeddings`, etc. from `@filemom/engine` as a workspace dependency — same runtime, no subprocess calls, full type safety.

---

## Phase 1: API Server Foundation

**Goal**: Standalone Fastify server that wraps the FileMom engine with REST endpoints. No frontend yet — test with curl/Postman.

### 1.1 Project Setup (`apps/api/`)

- `package.json` — Fastify, @fastify/cors, @fastify/websocket, @filemom/engine (workspace:*)
- `tsconfig.json` — extends base
- `src/index.ts` — server entry point, loads config, creates FileMom instance
- `src/config.ts` — reads `~/.filemom/config.json` (reuse CLI config logic or import from engine)
- Health check: `GET /api/health` → `{ status: 'ok', version: '0.1.0' }`

### 1.2 Core REST Endpoints

| Endpoint | Method | Handler | Engine Method |
|----------|--------|---------|--------------|
| `/api/health` | GET | Return status + version | None |
| `/api/stats` | GET | Return index stats + watched folders | `fm.getStats()` |
| `/api/scan` | POST | Trigger scan, return result | `fm.scan(options)` |
| `/api/search` | GET | Keyword search with filters | `fm.search(query, options)` |
| `/api/files/:path` | GET | Get single file record by path (base64-encoded path) | `fm.getFile(path)` |

### 1.3 Request/Response Types

- Define shared types in `apps/api/src/types.ts` or reuse from `@filemom/engine`
- All responses wrapped: `{ data: T }` on success, `{ error: string }` on failure
- Query params parsed with Fastify schema validation

### 1.4 Lifecycle Management

- `FileMom` initialized on server start (`fm.initialize()`)
- Graceful shutdown on SIGINT/SIGTERM (`fm.shutdown()`)
- Single FileMom instance shared across all request handlers

### 1.5 Tests

- `apps/api/tests/health.test.ts` — health endpoint returns 200
- `apps/api/tests/stats.test.ts` — stats endpoint returns IndexStats shape
- `apps/api/tests/scan.test.ts` — scan endpoint triggers scan and returns ScanResult
- `apps/api/tests/search.test.ts` — search endpoint returns SearchResult[]
- Use `fastify.inject()` for HTTP testing (no real server needed)
- Mock FileMom or use real engine with temp directory

### 1.6 Deliverables

```bash
cd apps/api && pnpm dev     # starts on localhost:4000
curl localhost:4000/api/health          # { "data": { "status": "ok" } }
curl localhost:4000/api/stats           # { "data": { "totalFiles": 42, ... } }
curl -X POST localhost:4000/api/scan    # { "data": { "totalFiles": 42, "newFiles": 3, ... } }
curl "localhost:4000/api/search?q=report&limit=10"  # { "data": [ ... ] }
```

---

## Phase 2: Frontend Shell + Dashboard

**Goal**: React app with routing, layout, and a functional dashboard page pulling live data from the API.

### 2.1 Project Setup (`apps/web/`)

- Vite + React + TypeScript
- `package.json` — react, react-router-dom, tailwindcss (or shadcn/ui), lucide-react (icons)
- `vite.config.ts` — proxy `/api` to `localhost:4000`
- `src/main.tsx` — app entry
- `src/App.tsx` — router setup

### 2.2 Layout & Navigation

- **Sidebar** (persistent):
  - Logo / "FileMom" title
  - Nav links: Dashboard, Search, Plan, Undo, Settings
  - Watcher status indicator (green/gray dot) — placeholder for now
- **Main content area**: renders current route
- **Responsive**: sidebar collapses on mobile

### 2.3 Dashboard Page (`/`)

- **Stats cards row**:
  - Total files (number)
  - Total size (formatted)
  - Last scan (relative time: "5 minutes ago")
  - Files by type (top 3 extensions)
- **Extension breakdown**: horizontal bar chart or simple table
- **Watched folders list**: folder path + file count per folder
- **"Scan Now" button**: triggers `POST /api/scan`, shows spinner, refreshes stats on complete
- **"Full Rescan" button**: same with `fullRescan: true`

### 2.4 API Client Layer

- `src/lib/api.ts` — typed fetch wrapper
  - `getStats(): Promise<IndexStats>`
  - `triggerScan(options?): Promise<ScanResult>`
  - `search(query, options?): Promise<SearchResult[]>`
  - Error handling: throws on non-200, caller catches and displays
- Uses `fetch()` with base URL from env or `/api` proxy

### 2.5 State Management

- React Query (TanStack Query) for server state (stats, search results)
- Auto-refetch on window focus
- Loading/error states handled by React Query

### 2.6 Tests

- Component tests with Vitest + React Testing Library
- `Dashboard.test.tsx` — renders stats, shows scan button
- `api.test.ts` — API client unit tests with mocked fetch

### 2.7 Deliverables

```bash
cd apps/web && pnpm dev     # starts on localhost:3000
# Browser opens dashboard with live stats from API
# "Scan Now" button works, stats refresh
```

---

## Phase 3: Search Page

**Goal**: Full search interface with filters, results table, and file detail view.

### 3.1 Search Page (`/search`)

- **Search bar**: text input with submit button, searches on Enter
- **Filter row**:
  - Extension chips (clickable: pdf, jpg, txt, docx, etc.) — toggle on/off
  - Limit dropdown (10, 20, 50, 100)
  - "Semantic" toggle switch (disabled if embeddings not enabled)
- **Results table**:
  - Columns: Name, Path (truncated), Size, Score, Snippet
  - Sortable by columns (client-side)
  - Click row → navigate to file detail
  - Empty state: "No results found" with suggestion text
- **Loading state**: skeleton rows while fetching

### 3.2 New API Endpoints

| Endpoint | Method | Engine Method |
|----------|--------|--------------|
| `/api/search` | GET | `fm.search(q, { limit, extensions })` |
| `/api/search/semantic` | GET | `fm.semanticSearch(q, { limit, extensions })` |

### 3.3 File Detail Modal or Page (`/files/:id`)

- Opens as a slide-over panel or separate page
- Sections:
  - **Metadata**: name, path, extension, size, mtime, ctime, hash
  - **Extracted text**: collapsible, scrollable text block
  - **EXIF data**: if image — camera, date, GPS coordinates, dimensions
  - **Vision**: if enriched — description, category, tags, confidence
- **Actions**:
  - "Open in Finder" (disabled on web, enabled on desktop)
  - "Enrich this file" → `POST /api/enrich` with file path
  - "Find duplicates" → `GET /api/files/duplicates/:hash`

### 3.4 New API Endpoints

| Endpoint | Method | Engine Method |
|----------|--------|--------------|
| `/api/files/:id` | GET | `indexer.getById(id)` |
| `/api/files/duplicates/:hash` | GET | `indexer.getByHash(hash)` |
| `/api/enrich` | POST | `fm.enrichFile(path)` |

### 3.5 Tests

- `Search.test.tsx` — renders search bar, displays results, handles empty state
- `FileDetail.test.tsx` — renders metadata sections
- API endpoint tests for search and file detail

### 3.6 Deliverables

```
Search page with live results from API
Click result → see full file metadata
Extension filters narrow results
Semantic toggle switches search mode
```

---

## Phase 4: Plan & Execute

**Goal**: Natural language planning interface with interactive refinement and execution.

### 4.1 Plan Page (`/plan`)

- **Command input**: large text input — "organize my tax documents by year"
- **"Generate Plan" button**: calls API, shows loading spinner
- **"Preview Only" checkbox**: skips AI call, shows matching files only
- **Model selector dropdown**: anthropic/claude-sonnet-4, etc.
- **Query expansion panel** (collapsible):
  - Keywords used
  - Folder patterns
  - File type filters
  - AI reasoning
- **Action plan table**:
  - Columns: Type (icon), Source, Destination, Confidence (color-coded bar), Reason
  - Row highlighting: green (high conf), yellow (medium), red (low)
  - "Needs review" badge on low-confidence rows
- **Warnings list**: yellow alert boxes
- **Summary bar**: files affected, folders created, total size
- **Cost display**: "$0.0042"
- **Action buttons**:
  - "Approve" → stores plan, navigates to execute
  - "Refine" → opens text input for feedback, calls refine endpoint, updates table
  - "Save as JSON" → client-side download
  - "Cancel" → clears plan

### 4.2 Refinement Flow

- After initial plan, "Refine" button appears
- Text input: "don't move the receipts, put invoices in /billing instead"
- Calls `POST /api/plan/refine`
- Updated plan replaces the table
- Max 3 refinement rounds (counter shown)
- Cost accumulates and displays

### 4.3 Execute Page (`/execute`)

- If navigated from Plan with an approved plan: shows the plan for final review
- **"Upload Plan" button**: alternative — upload a saved JSON file
- **Dry run toggle**: validate without executing
- **"Execute" button**: confirmation modal → calls API
- **Progress display**: real-time via WebSocket
  - Action-by-action: ✓ succeeded, ✗ failed, — skipped
  - Progress bar: completed / total
- **Results summary**: succeeded/failed/skipped counts
- **Error details**: expandable per-action errors
- **Batch ID + undo hint**: "Undo available for 30 minutes"

### 4.4 New API Endpoints

| Endpoint | Method | Engine Method |
|----------|--------|--------------|
| `/api/plan` | POST | `fm.plan(command, options)` |
| `/api/plan/refine` | POST | `fm.refinePlan({ plan, feedback, history })` |
| `/api/plan/expansion` | GET | `fm.getLastExpansion()` |
| `/api/plan/cost` | GET | `fm.getAICost()` |
| `/api/execute` | POST | `fm.execute(plan, options)` |

### 4.5 WebSocket Channel

- `WS /ws/execute` — streams execution progress events
  - `{ type: 'execute:success', actionId }` / `{ type: 'execute:failed', actionId, error }`

### 4.6 Tests

- `Plan.test.tsx` — renders input, shows plan table, refine flow
- `Execute.test.tsx` — renders plan review, execute button, progress
- API tests for plan/refine/execute endpoints

### 4.7 Deliverables

```
Type "organize photos by date" → see AI-generated plan
Refine with feedback → updated plan
Approve → execute with live progress
See results with undo hint
```

---

## Phase 5: Undo, Enrich & Embed

**Goal**: Complete the remaining feature pages.

### 5.1 Undo Page (`/undo`)

- **Undoable batches list**:
  - Each card: batch ID (short), intent, action count, expiry countdown timer
  - Color-coded: green = active, yellow = expiring soon (<5 min), gray = expired
- **"Undo" button per batch**: confirmation modal → calls API
- **Result display**: restored count, errors if any
- **Empty state**: "No undoable operations. Operations expire after 30 minutes."

### 5.2 Enrich Page (`/enrich`)

- **Status card**: unenriched file count
- **"Enrich Batch" button**: triggers batch enrichment
- **Limit slider**: 10-200 files
- **Progress bar**: real-time via WebSocket
- **Results**: enriched/skipped/errors counts, cost, duration
- **Recent enrichments list**: last 10 enriched files with descriptions

### 5.3 Embed Section (on Enrich page or Settings)

- **Status card**: unembedded file count, embedded count
- **"Generate Embeddings" button**: triggers batch embedding
- **Progress display**: embedded count
- **Result**: embedded/skipped/errors, duration

### 5.4 New API Endpoints

| Endpoint | Method | Engine Method |
|----------|--------|--------------|
| `/api/undo/batches` | GET | `fm.getUndoableBatches()` |
| `/api/undo` | POST | `fm.undo(batchId)` |
| `/api/enrich/batch` | POST | `fm.enrichFiles(options)` |
| `/api/enrich/file` | POST | `fm.enrichFile(path)` |
| `/api/enrich/status` | GET | `indexer.getUnenriched({ limit: 0 }).length` |
| `/api/embed` | POST | `fm.embedFiles(options)` |
| `/api/embed/status` | GET | `embeddings.getEmbeddedCount()` + `indexer.getUnembedded()` |

### 5.5 WebSocket Channel

- `WS /ws/enrich` — streams enrichment progress `{ done, total }`

### 5.6 Tests

- `Undo.test.tsx` — renders batch list, undo button, empty state
- `Enrich.test.tsx` — renders status, batch button, progress
- API endpoint tests

### 5.7 Deliverables

```
Undo page with live expiry countdowns
Enrich page with batch processing and cost tracking
Embed status and generation button
```

---

## Phase 6: Watcher & Real-Time Events

**Goal**: Live file change monitoring with WebSocket event stream.

### 6.1 Watcher Controls

- **Toggle switch** in sidebar: Start/Stop watching
- **Status indicator**: green dot = watching, gray = stopped
- When toggled on: calls `POST /api/watch/start`, server calls `fm.startWatching()`
- When toggled off: calls `POST /api/watch/stop`, server calls `fm.stopWatching()`

### 6.2 Activity Feed (Dashboard widget or dedicated page)

- **Live event stream**: newest at top
  - `+ /path/to/file.txt` (green, file created)
  - `~ /path/to/file.txt` (yellow, file modified)
  - `- /path/to/file.txt` (red, file deleted)
  - `! Error message` (red, watcher error)
- **Timestamp** per event
- **Max 100 events** in buffer (client-side ring buffer)
- **Pause/Resume button**: stops auto-scroll, keeps collecting
- **Clear button**: clears event list

### 6.3 New API Endpoints

| Endpoint | Method | Engine Method |
|----------|--------|--------------|
| `/api/watch/start` | POST | `fm.startWatching(handler)` |
| `/api/watch/stop` | POST | `fm.stopWatching()` |
| `/api/watch/status` | GET | `fm.isWatching` |

### 6.4 WebSocket Channel

- `WS /ws/watch` — streams `WatcherEvent` objects
  - Server registers handler via `fm.startWatching((event) => ws.send(event))`
  - Client displays events in activity feed

### 6.5 Tests

- `Watcher.test.tsx` — toggle switch, event feed rendering
- API tests for start/stop/status
- WebSocket test: connect, receive mock event, verify display

### 6.6 Deliverables

```
Toggle watcher from sidebar
See file changes appear in real-time
Events stream with color-coded types
```

---

## Phase 7: Settings Page

**Goal**: Configuration management without editing JSON files.

### 7.1 Settings Page (`/settings`)

- **Watched Folders section**:
  - List of current folders with "Remove" button each
  - "Add Folder" input + button (validates path exists server-side)
- **API Key**:
  - Masked input showing `sk-or-****...`
  - "Update" button
  - "Test Connection" button → makes a cheap API call to verify key works
- **AI Model**:
  - Dropdown selector with common models
  - Custom model input
- **Scan Settings**:
  - Exclude patterns: tag-style input (add/remove glob patterns)
  - Include hidden files toggle
  - Follow symlinks toggle
- **Vision Enrichment**:
  - Enable/disable toggle
  - Vision model selector
  - Batch size slider
- **Embeddings**:
  - Enable/disable toggle
  - Embedding model display
  - Dimensions display (read-only)
- **"Save Settings" button**: persists to `~/.filemom/config.json`
- **"Reset to Defaults" button**: confirmation modal

### 7.2 New API Endpoints

| Endpoint | Method | Engine Method |
|----------|--------|--------------|
| `/api/settings` | GET | Read config file |
| `/api/settings` | PUT | Write config file, reinitialize FileMom |
| `/api/settings/folders` | POST | Add folder (validate + save) |
| `/api/settings/folders` | DELETE | Remove folder (save) |
| `/api/settings/test-key` | POST | Verify OpenRouter API key |

### 7.3 Tests

- `Settings.test.tsx` — renders all sections, save button
- API tests for settings CRUD

### 7.4 Deliverables

```
Settings page with all config options
Add/remove watched folders
Update API key with masked display
Toggle vision/embeddings features
```

---

## Phase 8: Polish & Desktop Prep

**Goal**: UI polish, error handling, and preparation for Electron packaging.

### 8.1 UI Polish

- Loading skeletons on all data-fetching pages
- Toast notifications for success/error (scan complete, plan saved, etc.)
- Empty states with helpful CTAs ("No files indexed. Add a folder and scan.")
- Keyboard shortcuts: `/` to focus search, `Escape` to close modals
- Dark mode toggle (Tailwind `dark:` classes)
- Responsive design verification (tablet, mobile)

### 8.2 Error Handling

- Global error boundary with friendly error page
- API error toast display (red notification bar)
- Retry buttons on failed requests
- Offline detection: "API server not reachable" banner

### 8.3 Performance

- Virtual scrolling for large result sets (>100 results)
- Debounced search input (300ms)
- React Query cache tuning (staleTime, refetchInterval)
- Bundle size audit with `vite-plugin-visualizer`

### 8.4 Desktop Preparation (`apps/desktop/`)

- Electron wrapper project:
  - `main.ts` — starts API server + opens BrowserWindow
  - `preload.ts` — secure bridge for native features
  - Loads `localhost:4000` (API) and `localhost:3000` (web) in dev
  - Loads bundled files in production
- Native features:
  - "Open in Finder/Explorer" — `shell.showItemInFolder(path)`
  - System tray icon with watcher status
  - Auto-start option
  - File drag-and-drop onto window → add to watched folders
- Build targets:
  - macOS: `.dmg` via electron-builder
  - Windows: `.exe` / NSIS installer via electron-builder
- Code signing setup (placeholder for CI)

### 8.5 Tests

- E2E tests with Playwright: full flow from dashboard → scan → search → plan → execute → undo
- Desktop smoke test: Electron opens, loads dashboard, scan button works

### 8.6 Deliverables

```
Polished web app with dark mode, toasts, loading states
Electron wrapper that bundles everything into a native app
macOS .dmg and Windows .exe builds
```

---

## Summary

| Phase | Focus | Key Outputs | Estimated Scope |
|-------|-------|-------------|-----------------|
| **1** | API Server | Fastify + 5 REST endpoints + tests | ~300 lines |
| **2** | Frontend Shell + Dashboard | React app, routing, dashboard with live stats | ~500 lines |
| **3** | Search + File Detail | Search page, filters, file detail panel | ~400 lines |
| **4** | Plan & Execute | AI planning UI, refinement, execution with progress | ~600 lines |
| **5** | Undo, Enrich, Embed | Remaining feature pages | ~400 lines |
| **6** | Watcher & Real-Time | WebSocket events, live activity feed | ~300 lines |
| **7** | Settings | Config management UI | ~400 lines |
| **8** | Polish & Desktop | Dark mode, toasts, Electron packaging | ~500 lines |

**Total**: ~3,400 lines across 8 phases

Each phase is independently deployable. After Phase 2, you have a working web app. After Phase 7, every feature is accessible. Phase 8 wraps it for distribution.

---

## Changelog

_This section tracks implementation progress._

| Date | Phase | Changes |
|------|-------|---------|
| 2026-03-19 | Phase 1 | API server built — Fastify on :4000, 5 REST endpoints (health, stats, scan, search, files), 13 integration tests, CORS enabled, error handling, 5-minute request timeout for long scans |
| 2026-03-19 | Phase 2 | React frontend — Vite+React 19+Tailwind v4 on :5173, Dashboard with stats cards/extension chart/watched folders/scan buttons, API client with TanStack Query, Sidebar with nav+API status indicator, loading skeletons, empty state, error state, notification banners, 30 tests (api+utils+Dashboard) |
| 2026-03-19 | Phase 3 | Search page — debounced search bar, extension filter chips, limit dropdown, semantic toggle, sortable results table with extension color dots + snippets, File Detail slide-over panel with metadata/extracted text/EXIF/vision sections, collapsible sections, hash copy button, 11 new tests |
| 2026-03-19 | Phase 4 | Plan & Execute — AI plan generation with confidence bars/warnings/needs-review badges, query expansion display, 3-round refinement loop, confirm dialog with dry-run, execution results with per-action status, undo banner with batch ID, Undo history page with live countdowns. API: plan/refine/execute/undo endpoints. 15 new tests (9 Plan page + 6 API validation) |
| 2026-03-19 | Phase 5 | Enrich & Embed — Vision enrichment page (purple accent, batch limit slider, cost warning, results panel), Embeddings section (emerald accent, free/local callout, results panel), feature gate banners when disabled, status cards (unenriched/unembedded counts). Engine: getUnenrichedCount/getUnembeddedCount/getFeatureFlags. API: enrich/status + enrich/batch + enrich/file + embed endpoints. 10 new tests |
| 2026-03-19 | Phase 7 | Settings — Full config management UI with 7 sections: API key (masked display, test connection), Watched folders (add/remove with validation), AI model (dropdown + custom), Scan settings (exclude patterns tags, toggles), Vision (enable toggle, model, batch size), Embeddings (enable toggle, read-only model/dims), Advanced (collapsed, 7 number fields). Expanded PUT /api/settings to 17 fields with type validation. POST/DELETE /api/settings/folders. POST /api/settings/test-key. Restart banner on save. 22 new tests |
| 2026-03-19 | Phase 6 | Watcher & Real-Time — WebSocket event streaming via @fastify/websocket, broadcast pattern (one watcher → multiple browser tabs), REST control plane (start/stop/status), sidebar watcher toggle with green pulse indicator, Dashboard ActivityFeed component with color-coded events (created/modified/deleted), useWatchEvents hook with auto-reconnect + ring buffer (100 max), Vite WS proxy. 3 new API tests |
| 2026-03-19 | Phase 8 | Polish & Desktop — Global toast notifications (sonner), dark mode with theme toggle (light/dark/system, persisted to localStorage), responsive sidebar (mobile hamburger menu + overlay), global ErrorBoundary, dark mode classes on StatsCard + Sidebar + Layout. Electron scaffold (apps/desktop/) with main process + preload placeholder |
