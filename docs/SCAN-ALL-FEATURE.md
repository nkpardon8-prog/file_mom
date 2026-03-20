# FileMom v2: AI File Intelligence & Visual File Editor

## Overview

Transform FileMom from a file indexer into a full AI-powered file manager. Every file gets a rich AI-generated description stored locally. Users browse files in a Finder-like UI, filter by AI categories, and create smart folders with conversational AI.

---

## Architecture: Before & After

```
CURRENT (v1):
  Scan → Extract text/EXIF → Index → Search (keyword) → Plan → Execute

NEW (v2):
  Scan → Extract (+ XLSX/CSV) → AI Describe (per-type schema) → Index
                                                                   ↓
                                            Visual File Browser (Finder clone)
                                              ↓              ↓           ↓
                                         Filter by      Smart Folder   Drag-drop
                                        AI metadata      Creation       Move/Copy
```

---

## Build Phases (8 phases, strict order)

### Phase V2-1: Schema & Database Foundation

**Goal**: Define the data structures and database schema for AI descriptions. Everything else depends on this.

**Why first**: Every subsequent phase writes to or reads from this schema. Getting it wrong means rewriting everything.

#### New Types (`packages/engine/src/types.ts`)

```typescript
// Base description (ALL file types)
interface AIFileDescription {
  description: string;           // "Invoice from Amazon, USB-C hub, $45.99"
  category: AICategory;          // enum: financial, work, personal, medical, legal, etc.
  subcategory: string;           // "invoice", "receipt", "report", "photo", etc.
  tags: string[];                // ["amazon", "electronics", "2024"]
  dateContext: string | null;    // "Q4 2024", "Summer 2023", "January 15, 2024"
  source: string | null;        // "Amazon", "Accounting Dept", "personal_photo"
  language: string | null;       // "en", "es", "fr"
  confidence: number;            // 0.0–1.0
  sensitive: boolean;            // true if contains PII/financial/medical data
  sensitiveType: string | null;  // "financial", "medical", "pii", "legal"
  contentType: AIContentType;    // "photo", "screenshot", "scan", "document", "spreadsheet", "audio"
}

// Photo-specific (real camera photos)
interface AIPhotoDetails {
  sceneType: string;              // "outdoor_beach", "indoor_office", "portrait"
  setting: string | null;         // "Waikiki Beach, Hawaii"
  timeOfDay: string | null;       // "sunset", "morning", "night"
  weather: string | null;         // "clear", "cloudy", "rainy"
  season: string | null;          // "summer", "winter"
  people: {
    count: number;
    descriptions: string[];       // ["Adult male in blue shirt", ...]
    facesVisible: boolean;
  };
  objects: string[];              // ["surfboard", "palm_trees", "car"]
  animals: string[];              // ["dog", "cat"]
  location: {
    description: string | null;   // "Waikiki Beach, Honolulu, Hawaii"
    type: string | null;          // "beach", "restaurant", "park"
    indoorOutdoor: string;        // "indoor" | "outdoor"
  };
  eventType: string | null;       // "vacation", "wedding", "birthday", "work_event"
  mood: string | null;            // "relaxed", "celebratory", "professional"
  quality: string;                // "high", "medium", "low"
}

// Screenshot-specific (UI captures)
interface AIScreenshotDetails {
  application: string | null;     // "Slack", "Chrome", "VS Code", "Excel"
  platform: string | null;        // "macOS", "Windows", "iOS", "Android"
  purpose: string | null;         // "conversation", "error_message", "data_display", "tutorial"
  textContent: string | null;     // OCR'd text from the screenshot
  mentionedNames: string[];       // People mentioned in visible text
  urls: string[];                 // URLs visible in screenshot
}

// Document Scan-specific (photos of physical documents)
interface AIScanDetails {
  documentType: string;           // "receipt", "letter", "form", "contract"
  textContent: string | null;     // OCR'd text
  entities: AIDocumentEntities;   // Same structure as document
  isHandwritten: boolean;
  quality: string;                // "clear", "blurry", "partial"
}

// Document-specific (PDF, DOCX, TXT, RTF)
interface AIDocumentDetails {
  documentType: string;           // "invoice", "contract", "report", "letter", "form"
  subject: string;                // "Electronics purchase"
  summary: string;                // 2-3 sentence summary of content
  entities: AIDocumentEntities;
  pageCount: number | null;
  hasSignature: boolean;
  hasStamp: boolean;
  isForm: boolean;
  isScanned: boolean;
}

interface AIDocumentEntities {
  companies: Array<{ name: string; role: string }>;
  people: Array<{ name: string; role: string }>;
  amounts: Array<{ value: number; currency: string; context: string }>;
  dates: Array<{ date: string; context: string }>;
  addresses: string[];
  references: Array<{ type: string; value: string }>;  // order numbers, invoice IDs, etc.
}

// Spreadsheet-specific (XLSX, CSV, XLS)
interface AISpreadsheetDetails {
  dataType: string;               // "expense_tracker", "inventory", "contact_list", "schedule"
  subject: string;                // "Personal monthly expenses"
  columns: string[];              // ["Date", "Description", "Amount"]
  rowCount: number;
  sheetNames: string[];           // ["Expenses", "Income", "Summary"]
  dateRange: { from: string; to: string } | null;
  numericSummary: {
    totalAmount: number | null;
    currency: string | null;
    maxValue: number | null;
  } | null;
  hasFormulas: boolean;
  hasCharts: boolean;
  keyInsights: string[];          // ["Rent is largest expense at $2400/mo"]
}

// Audio-specific (MP3, FLAC, WAV, M4A)
interface AIAudioDetails {
  contentType: string;            // "music", "podcast", "voice_memo", "audiobook"
  artist: string | null;
  album: string | null;
  title: string | null;
  genre: string | null;
  year: number | null;
  duration: string | null;
  mood: string | null;
  isVoiceRecording: boolean;
}

// Category enum
type AICategory =
  | 'financial' | 'work' | 'personal' | 'medical' | 'legal'
  | 'education' | 'creative' | 'communication' | 'reference' | 'media';

// Content type enum
type AIContentType =
  | 'photo' | 'screenshot' | 'scan'
  | 'document' | 'spreadsheet' | 'audio' | 'other';
```

#### Database Migration V4 (`packages/engine/src/indexer.ts`)

New columns on `files` table:
```sql
ALTER TABLE files ADD COLUMN ai_description TEXT;
ALTER TABLE files ADD COLUMN ai_category TEXT;
ALTER TABLE files ADD COLUMN ai_subcategory TEXT;
ALTER TABLE files ADD COLUMN ai_tags TEXT;           -- JSON array
ALTER TABLE files ADD COLUMN ai_date_context TEXT;
ALTER TABLE files ADD COLUMN ai_source TEXT;
ALTER TABLE files ADD COLUMN ai_content_type TEXT;
ALTER TABLE files ADD COLUMN ai_confidence REAL;
ALTER TABLE files ADD COLUMN ai_sensitive INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN ai_sensitive_type TEXT;
ALTER TABLE files ADD COLUMN ai_details TEXT;        -- Full JSON (type-specific)
ALTER TABLE files ADD COLUMN ai_described_at INTEGER;
ALTER TABLE files ADD COLUMN ai_description_model TEXT;
```

New indexes:
```sql
CREATE INDEX idx_files_ai_category ON files(ai_category);
CREATE INDEX idx_files_ai_subcategory ON files(ai_subcategory);
CREATE INDEX idx_files_ai_content_type ON files(ai_content_type);
CREATE INDEX idx_files_ai_sensitive ON files(ai_sensitive);
CREATE INDEX idx_files_ai_described_at ON files(ai_described_at);
```

Update FTS5 to include `ai_description`:
```sql
-- Recreate FTS5 with ai_description column
DROP TRIGGER files_ai; DROP TRIGGER files_ad; DROP TRIGGER files_au;
DROP TABLE files_fts;
CREATE VIRTUAL TABLE files_fts USING fts5(
  name, extracted_text, path, vision_description, ai_description,
  content='files', content_rowid='id', tokenize='porter unicode61'
);
-- Recreate triggers to include ai_description
```

#### Zod Validation Schemas (`packages/engine/src/describer.ts`)

Zod schemas for each output type. The AI must conform to these or the response is rejected and retried.

#### Files Changed

| File | Change |
|------|--------|
| `packages/engine/src/types.ts` | Add all AI description interfaces |
| `packages/engine/src/indexer.ts` | Migration V4, new columns, updated FTS5 |
| `packages/engine/src/describer.ts` | New file — Zod schemas for AI output validation |

---

### Phase V2-2: XLSX/CSV Extraction

**Goal**: The Extractor can't read spreadsheets. Fix that before we try to describe them.

**Why now**: The Describer needs content from spreadsheets. Without this, XLSX/CSV files get empty descriptions.

#### Implementation

- Add `xlsx` (SheetJS) dependency to `packages/engine`
- Extend `Extractor._extractInternal()` with a new branch for spreadsheet extensions
- Extract: sheet names, column headers, first 10 rows per sheet, row count, formula presence
- Format as structured text for the Describer to consume

#### New Extractor Output

```typescript
// Added to ExtractedMetadata
spreadsheetData: {
  sheets: Array<{
    name: string;
    columns: string[];
    sampleRows: string[][];  // First 10 rows
    rowCount: number;
    hasFormulas: boolean;
  }>;
} | null;
```

#### Supported Extensions

`xlsx`, `xls`, `csv`, `tsv`

#### Files Changed

| File | Change |
|------|--------|
| `packages/engine/package.json` | Add `xlsx` dependency |
| `packages/engine/src/extractor.ts` | Add spreadsheet extraction branch |
| `packages/engine/src/types.ts` | Add `spreadsheetData` to `ExtractedMetadata` |
| `packages/engine/tests/extractor.test.ts` | Add spreadsheet extraction tests |

---

### Phase V2-3: AI Describer Engine Component

**Goal**: New `Describer` class that takes a file's extracted content and generates structured AI descriptions using the appropriate model and schema per file type.

**Why now**: This is the core intelligence layer. Everything after this depends on files having rich descriptions.

#### Architecture

```
Describer
  ├── detectContentType(file, extractedMeta) → 'photo' | 'screenshot' | 'scan' | 'document' | ...
  ├── describePhoto(path, exif) → AIPhotoDetails      [VLM: Qwen VL or Gemini Vision]
  ├── describeScreenshot(path) → AIScreenshotDetails   [VLM: same, different prompt]
  ├── describeScan(path) → AIScanDetails               [VLM: same, OCR-focused prompt]
  ├── describeDocument(text, filename) → AIDocumentDetails  [Text LLM: Gemini Flash]
  ├── describeSpreadsheet(data, filename) → AISpreadsheetDetails [Text LLM: Gemini Flash]
  ├── describeAudio(metadata) → AIAudioDetails          [Text LLM or skip — metadata already structured]
  └── describeBatch(files, onProgress) → results        [Batch orchestrator]
```

#### Model Routing

| Content Type | Model | Input | Cost/File |
|-------------|-------|-------|-----------|
| Photo | Qwen VL 7B (via OpenRouter) | Image (base64) | ~$0.005 |
| Screenshot | Qwen VL 7B | Image (base64) | ~$0.005 |
| Document Scan | Qwen VL 7B | Image (base64) | ~$0.005 |
| PDF/DOCX/TXT | Gemini 2.5 Flash (via OpenRouter) | First 3000 chars + filename | ~$0.0004 |
| XLSX/CSV | Gemini 2.5 Flash | Headers + 10 rows + metadata | ~$0.0004 |
| Audio | Skip (use existing metadata) | N/A | $0 |

#### Image Content Type Detection

The FIRST call to the VLM for any image file asks:
```
"Classify this image as exactly one of: photograph, screenshot, document_scan.
Then provide the full description."
```

The response includes a `contentType` field that determines which schema to validate against.

#### Prompt Templates (one per type)

Each prompt:
1. Describes the exact JSON schema expected
2. Lists all valid category/subcategory values
3. Includes examples of good output
4. Enforces `response_format: { type: 'json_object' }`

#### Config Fields

Add to `ConfigSchema`:
```typescript
enableAIDescriptions: z.boolean().default(false),
descriptionModel: z.string().default('google/gemini-2.5-flash'),
descriptionBatchSize: z.number().int().min(1).max(500).default(100),
descriptionMaxConcurrent: z.number().int().min(1).max(20).default(5),
```

#### Files Changed

| File | Change |
|------|--------|
| `packages/engine/src/describer.ts` | New file — full Describer class (~400 lines) |
| `packages/engine/src/config.ts` | Add description config fields |
| `packages/engine/src/types.ts` | Add DescriberConfig type |
| `packages/engine/src/index.ts` | Export Describer + types |
| `packages/engine/tests/describer.test.ts` | New — mock LLM, test schema validation |

---

### Phase V2-4: "Scan All" & "Refresh" — Engine + API + UI

**Goal**: Wire the Describer into FileMom, expose via API, add "Scan All" and "Refresh" buttons to the UI.

#### FileMom Methods

```typescript
// Describe all undescribed files
async describeAll(options?: {
  limit?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<DescriptionResult>

// Re-describe only new/changed files since last description
async describeNew(options?: {
  onProgress?: (done: number, total: number) => void;
}): Promise<DescriptionResult>

// Describe single file
async describeFile(path: string): Promise<AIFileDescription>

// Get count of undescribed files
async getUndescribedCount(): Promise<number>
```

#### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/describe/all` | POST | Describe all undescribed files (body: `{ limit? }`) |
| `/api/describe/refresh` | POST | Describe only new/changed files |
| `/api/describe/file` | POST | Describe single file (body: `{ path }`) |
| `/api/describe/status` | GET | Count of described vs undescribed files |

#### UI Changes

**Dashboard**: Add prominent "Scan All" button (primary action, top of page). Add "Refresh" button next to it. Show progress bar during scan. Show description stats (X of Y files described).

**Header bar** (visible on all pages): Small status indicator "423/500 files described" with progress ring.

#### Files Changed

| File | Change |
|------|--------|
| `packages/engine/src/filemom.ts` | Add describeAll, describeNew, describeFile, getUndescribedCount |
| `apps/api/src/routes/describe.ts` | New — 4 endpoints |
| `apps/api/src/app.ts` | Register describe routes |
| `apps/web/src/lib/api.ts` | Add describe types + functions |
| `apps/web/src/hooks/useApi.ts` | Add useDescribeAll, useDescribeRefresh hooks |
| `apps/web/src/pages/Dashboard.tsx` | Add Scan All + Refresh buttons + progress |

---

### Phase V2-5: Enhanced Filter UI

**Goal**: Replace the basic search page with category/tag/source filtering powered by AI descriptions.

#### New Filter Controls

```
┌──────────────────────────────────────────────────────────────┐
│  [Category ▾]  [Type ▾]  [Date ▾]  [Source ▾]  [Search...] │
│  financial      photo     2024      Amazon      free text    │
│  work           document  Q4 2024   Personal                 │
│  personal       screenshot                                   │
│  medical        spreadsheet                                  │
│  ...            scan                                         │
│                                                              │
│  Tags: [tax] [receipt] [amazon] [2024]     [Sensitive only] │
└──────────────────────────────────────────────────────────────┘
```

#### API Endpoint

```
GET /api/files/browse?category=financial&subcategory=invoice&dateContext=2024&source=Amazon&tags=receipt&sensitive=true&q=usb+hub&limit=50&offset=0
```

This is a new query method on the Indexer that combines SQL WHERE clauses on the new AI columns with FTS5 for free-text search.

#### Files Changed

| File | Change |
|------|--------|
| `packages/engine/src/indexer.ts` | Add `browseFiles()` method with multi-filter query |
| `apps/api/src/routes/files.ts` | Add GET /api/files/browse endpoint |
| `apps/web/src/pages/Search.tsx` | Rebuild as filter-first browse page |
| `apps/web/src/lib/api.ts` | Add browse types + function |

---

### Phase V2-6: Visual File Browser (Finder Clone)

**Goal**: Full Finder-like file manager UI. This is the main interface — replaces the dashboard as the default view.

#### Layout

```
┌──────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR  │  TOOLBAR                                             │
│          │  [← →] 📁 Home > Documents > Tax > 2024              │
│ 📁 Home  │  [Scan All] [Refresh] [List ≡] [Grid ⊞]            │
│ 📁 Docs  │                                                      │
│  📁 Tax  │  FILTER BAR                                          │
│   📁2024 │  [All Categories ▾] [All Types ▾] [Search...      ] │
│   📁2023 │                                                      │
│ 📁 Photos│  FILE LIST                                           │
│ 📁 Music │  ┌────────────────────────────────────────────────┐  │
│ 📁 Work  │  │ 📄 w2-form-2024.pdf                    12 KB  │  │
│          │  │ Financial • Tax • W-2 from employer     Jan 24 │  │
│ ──────── │  ├────────────────────────────────────────────────┤  │
│ Smart    │  │ 📄 amazon-receipt.pdf                    8 KB  │  │
│ Folders  │  │ Financial • Receipt • USB-C hub $45.99  Jan 24 │  │
│ 📁Tax 24 │  ├────────────────────────────────────────────────┤  │
│ 📁Receipts│ │ 🖼 beach-sunset.jpg                   4.2 MB  │  │
│          │  │ Personal • Photo • Waikiki Beach sunset Aug 23 │  │
│          │  └────────────────────────────────────────────────┘  │
│          │                                                      │
│ [+New]   │  STATUS BAR                                          │
│          │  423 files • 2.1 GB • 400/423 described              │
└──────────┴──────────────────────────────────────────────────────┘
```

#### Components

**FolderTree** (left panel):
- Recursive folder tree from watched directories
- Collapse/expand folders
- Click to navigate
- Drag files onto folders to move
- "Smart Folders" section at bottom (AI-created folders)
- New endpoint: `GET /api/folders/tree` returns folder hierarchy

**Breadcrumb** (top of file list):
- Shows current path
- Each segment clickable to navigate up
- Back/forward navigation

**Toolbar**:
- Scan All / Refresh buttons
- View toggle: list view vs grid view
- Sort dropdown: name, date, size, category

**FileCard** (each file in the list):
- File icon (by extension/type)
- Name
- AI description (1 line, truncated)
- Category badge + subcategory
- Tags (first 3)
- Size + date
- Click → opens detail panel (existing FileDetail, enhanced)
- Right-click → context menu (Move, Copy, Rename, Delete, Re-describe)
- Draggable for drag-drop operations

**FileGrid** (alternative view):
- Thumbnail preview for images
- Icon + name + category for documents
- 4-column grid

**ContextMenu** (right-click):
```
Move to...        →
Copy to...        →
Rename
Delete
─────────────
Re-describe with AI
View AI Details
─────────────
Open in Finder
```

#### New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/folders/tree` | GET | Returns folder hierarchy for tree view |
| `/api/folders/contents` | GET | Returns files in a specific folder (with AI data) |
| `/api/files/move` | POST | Move file(s) to destination folder |
| `/api/files/copy` | POST | Copy file(s) to destination folder |
| `/api/files/rename` | POST | Rename a file |
| `/api/files/delete` | POST | Delete file(s) |

#### Files Changed

| File | Change |
|------|--------|
| `packages/engine/src/indexer.ts` | Add folder tree query, folder contents query |
| `apps/api/src/routes/folders.ts` | New — folder tree + contents endpoints |
| `apps/api/src/routes/files.ts` | Add move, copy, rename, delete endpoints |
| `apps/web/src/pages/Browser.tsx` | New — main file browser page (~500 lines) |
| `apps/web/src/components/FolderTree.tsx` | New — recursive folder tree |
| `apps/web/src/components/FileCard.tsx` | New — file card with AI description |
| `apps/web/src/components/Breadcrumb.tsx` | New — path breadcrumb navigation |
| `apps/web/src/components/ContextMenu.tsx` | New — right-click menu |
| `apps/web/src/components/FilterBar.tsx` | New — category/type/date/source filters |
| `apps/web/src/App.tsx` | Add /browser route, make it default |
| `apps/web/src/components/Sidebar.tsx` | Update nav — Browser becomes primary |

---

### Phase V2-7: Smart Folder Creation (Conversational AI)

**Goal**: User creates a folder, describes what goes in it, AI asks clarifying questions, then auto-sorts matching files.

#### UX Flow

```
Step 1: User clicks [+ New Smart Folder]
  → Modal opens
  → User types folder name: "Tax 2024"
  → User types description: "All tax-related documents from 2024"

Step 2: AI Q&A (chat interface in modal)
  AI: "I found 47 potential matches. A few questions to narrow this down:"
  AI: "1. Should I include receipts that might be tax-deductible?"
  User: "Yes"
  AI: "2. Include bank statements?"
  User: "No, just tax forms and receipts"
  AI: "3. Should this include documents from both personal and work?"
  User: "Personal only"

Step 3: Preview
  AI shows list of 23 matching files with descriptions
  User can remove individual files from the list
  [Create Folder & Move Files] button

Step 4: Execution
  Creates folder at chosen location
  Moves files
  Shows undo option
```

#### How Matching Works

1. AI generates search criteria from the conversation:
   ```json
   {
     "categories": ["financial"],
     "subcategories": ["tax", "receipt"],
     "dateContext": "2024",
     "excludeSubcategories": ["bank_statement"],
     "sourceFilter": null,
     "sensitiveOnly": false,
     "customQuery": "tax OR receipt OR w2 OR 1099 OR deduction"
   }
   ```

2. These criteria become SQL + FTS5 + embedding queries against the AI description data

3. Results ranked by relevance, previewed to user

#### Subfolder Support

After creating "Tax 2024", user can:
- Click into it
- Click [+ New Smart Subfolder]
- "Deductions" → AI finds deduction-related files within the parent folder
- "W-2 Forms" → AI finds W-2s specifically

#### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/smart-folder/ask` | POST | Send user message, get AI questions/responses |
| `/api/smart-folder/preview` | POST | Get list of matching files based on criteria |
| `/api/smart-folder/create` | POST | Create folder + move files |

#### Files Changed

| File | Change |
|------|--------|
| `packages/engine/src/filemom.ts` | Add smartFolderAsk, smartFolderPreview, smartFolderCreate methods |
| `packages/engine/src/ai.ts` | Add smart folder conversation prompts |
| `apps/api/src/routes/smart-folder.ts` | New — 3 endpoints |
| `apps/web/src/components/SmartFolderModal.tsx` | New — chat-like creation flow |
| `apps/web/src/pages/Browser.tsx` | Add smart folder button + integration |

---

### Phase V2-8: Polish & Integration

**Goal**: Connect all pieces, handle edge cases, optimize performance.

#### Items

1. **Re-describe single file**: Right-click → "Re-describe with AI" → overwrites old description
2. **Description quality indicator**: Show confidence badge on file cards. Low confidence = "AI unsure" label
3. **Batch progress**: WebSocket for real-time Scan All progress (reuse existing /ws/watch pattern)
4. **Cost dashboard**: Show cumulative description costs, cost per file breakdown
5. **Export descriptions**: JSON export of all AI descriptions (for backup/portability)
6. **Keyboard shortcuts for browser**: Arrow keys to navigate files, Enter to open, Delete to delete, Cmd+C/V for copy/paste
7. **Drag-drop visual feedback**: Ghost preview of file being dragged, highlight drop target folder
8. **Empty folder states**: "This folder is empty" with suggestion to create smart subfolder
9. **Performance**: Virtual scrolling for 1000+ file lists. Lazy-load folder tree branches.
10. **Tests**: Unit tests for Describer, API tests for new endpoints, component tests for Browser

#### Files Changed

Multiple files across all layers — integration work.

---

## Dependency Graph

```
V2-1: Schema & Database  ──────────────────────────────────┐
  ↓                                                         │
V2-2: XLSX/CSV Extraction                                   │
  ↓                                                         │
V2-3: AI Describer Engine  ←────────────────────────────────┘
  ↓
V2-4: Scan All & Refresh (API + UI)
  ↓
V2-5: Enhanced Filter UI  ───────┐
  ↓                              │
V2-6: Visual File Browser  ←────┘
  ↓
V2-7: Smart Folder Creation
  ↓
V2-8: Polish & Integration
```

Phases V2-1 through V2-4 are strictly sequential (each depends on the previous).
V2-5 and V2-6 can partially overlap.
V2-7 depends on V2-6 (needs the browser UI).
V2-8 is final polish.

---

## Model Configuration

| Use Case | Default Model | Via | Configurable |
|----------|--------------|-----|-------------|
| Photo/Screenshot/Scan description | `qwen/qwen-2.5-vl-7b-instruct` | OpenRouter | Yes — `visionModel` in config |
| Document/Spreadsheet description | `google/gemini-2.5-flash` | OpenRouter | Yes — `descriptionModel` in config |
| Smart Folder Q&A | `anthropic/claude-sonnet-4` | OpenRouter | Yes — `model` in config |
| Content type detection (photo vs screenshot) | Same VLM as above | — | — |
| Embeddings | `all-MiniLM-L6-v2` | Local Transformers.js | Yes — `embeddingModel` |

---

## Cost Estimates

| Operation | Files | Est. Cost |
|-----------|-------|-----------|
| Scan All (1,000 files mixed) | 500 docs + 300 images + 200 spreadsheets | ~$2.00 |
| Scan All (5,000 files) | Mixed | ~$10.00 |
| Refresh (50 new files) | Mixed | ~$0.10 |
| Smart Folder creation | 1 conversation | ~$0.05 |
| Re-describe single file | 1 file | ~$0.005 |

---

## File Count Summary

| Phase | New Files | Modified Files | Est. Lines |
|-------|-----------|---------------|------------|
| V2-1 | 1 | 2 | ~200 |
| V2-2 | 0 | 3 | ~100 |
| V2-3 | 2 | 3 | ~500 |
| V2-4 | 1 | 5 | ~300 |
| V2-5 | 0 | 4 | ~200 |
| V2-6 | 6 | 3 | ~1200 |
| V2-7 | 2 | 3 | ~400 |
| V2-8 | 0 | ~10 | ~300 |
| **Total** | **12** | **~25** | **~3200** |

---

## Changelog

| Date | Phase | Changes |
|------|-------|---------|
| 2026-03-20 | V2-1 | Schema & Database Foundation — 13 new AI description fields on FileRecord, Migration V4 (ALTER TABLE + indexes + FTS5 rebuild with ai_description column), updated upsert SQL (boolean→integer conversion for aiSensitive), new query methods (getUndescribedCount, getUndescribed, getCategories), 3 new config fields (enableAIDescriptions, descriptionModel, descriptionBatchSize), new type interfaces (AICategory, AIContentType, DescriptionResult). 5 new tests. Total: 447 tests passing. |
