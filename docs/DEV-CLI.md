# FileMom Development CLI

The dev CLI is a command-line interface for testing and developing the FileMom engine. It wraps the engine API and provides a fast feedback loop without needing Electron.

**This CLI is NOT shipped to end users.** It's for:
- Development and debugging
- Automated testing in CI/CD
- Demos before UI is ready
- Dogfooding the API

---

## Installation & Setup

```bash
# From monorepo root
pnpm install
pnpm build

# Run CLI
pnpm cli <command>

# Or link globally for convenience
pnpm cli:link
filemom <command>
```

### Environment Variables

```bash
# Required
export ANTHROPIC_API_KEY=sk-ant-...

# Optional
export FILEMOM_DATA_DIR=~/.filemom      # Default: ~/.filemom
export FILEMOM_LOG_LEVEL=debug          # Default: info
export FILEMOM_MODEL=claude-sonnet-4-20250514
```

---

## Command Overview

```
filemom <command> [options]

Commands:
  init                    Initialize FileMom data directory
  add <folder>            Add folder to watch list
  remove <folder>         Remove folder from watch list
  scan                    Scan and index watched folders
  status                  Show index statistics
  search <query>          Search files by keyword
  info <path>             Show details for a specific file
  plan <command>          Generate action plan from natural language
  execute <file>          Execute a saved action plan
  history                 Show recent operations
  undo [batch-id]         Undo an operation batch
  config <action>         Manage configuration
  extract <file>          Debug: test metadata extraction
  hash <file>             Debug: show file hash
  db                      Debug: open SQLite shell
  watch                   Debug: run watcher in foreground
  help [command]          Show help

Global Options:
  --json                  Output as JSON (for scripting)
  --quiet, -q             Minimal output
  --verbose, -v           Verbose output
  --no-color              Disable colored output
  --data-dir <path>       Override data directory
  --help, -h              Show help
  --version               Show version
```

---

## Commands in Detail

### `filemom init`

Initialize FileMom in a directory. Creates database, config file, and data structures.

```bash
filemom init [options]

Options:
  --data-dir <path>       Where to store data (default: ~/.filemom)
  --force                 Overwrite existing initialization
```

**Output (pretty):**
```
✓ Created data directory: ~/.filemom
✓ Initialized database: ~/.filemom/index.db
✓ Created config file: ~/.filemom/config.json

FileMom initialized. Next steps:
  filemom add ~/Documents    Add folders to watch
  filemom scan               Scan and index files
```

**Output (JSON):**
```json
{
  "success": true,
  "dataDir": "/Users/nick/.filemom",
  "database": "/Users/nick/.filemom/index.db",
  "config": "/Users/nick/.filemom/config.json"
}
```

---

### `filemom add <folder>`

Add a folder to the watch list.

```bash
filemom add <folder> [options]

Arguments:
  folder                  Path to folder (absolute or relative)

Options:
  --no-scan               Don't scan immediately after adding
  --recursive             Include subfolders (default: true)
```

**Output:**
```
✓ Added folder: ~/Documents
  Files found: 2,341
  Starting scan...

⠸ Scanning files... 1,204 / 2,341
✓ Scan complete

  New files indexed: 2,341
  Duration: 12.4s
```

---

### `filemom remove <folder>`

Remove a folder from the watch list.

```bash
filemom remove <folder> [options]

Options:
  --keep-index            Keep files in index (don't delete records)
```

**Output:**
```
? Remove ~/Documents from watch list? (y/N) y
✓ Removed folder: ~/Documents
  Files removed from index: 2,341
```

---

### `filemom scan`

Scan watched folders and update the index.

```bash
filemom scan [options]

Options:
  --folders <paths>       Scan specific folders only (comma-separated)
  --full                  Full rescan (ignore existing index)
  --extract               Run deep extraction (slower)
  --stats                 Show detailed statistics after scan
```

**Output:**
```
Scanning 3 folders...

~/Documents
  ⠸ Scanning... 1,204 / 2,341
  ✓ Complete (2,341 files)

~/Downloads
  ⠸ Scanning... 89 / 156
  ✓ Complete (156 files)

~/Desktop
  ✓ Complete (23 files)

┌─────────────────────────────────────┐
│           Scan Summary              │
├─────────────────────────────────────┤
│ Total files:        2,520           │
│ New files:            47            │
│ Updated files:        12            │
│ Deleted files:         3            │
│ Errors:                0            │
│ Duration:          14.2s            │
└─────────────────────────────────────┘
```

**With --extract:**
```
Scanning 3 folders...

Phase 1: Quick scan
  ✓ Found 2,520 files (3.2s)

Phase 2: Deep extraction
  ⠸ Extracting metadata... 423 / 2,520
    PDFs extracted: 89
    Images with EXIF: 234
    Documents parsed: 67
  ✓ Extraction complete (2m 14s)
```

---

### `filemom status`

Show index statistics and system status.

```bash
filemom status [options]

Options:
  --detailed              Show per-folder breakdown
  --extensions            Show file type distribution
```

**Output:**
```
FileMom Status
══════════════

Database: ~/.filemom/index.db (24.3 MB)
Last scan: 2 hours ago

Indexed Files
─────────────
Total files:     12,453
Total size:      8.2 GB
With text:        1,234 (9.9%)
With EXIF:        3,456 (27.8%)

Watched Folders
───────────────
~/Documents      4,231 files    Last scan: 2h ago
~/Downloads        892 files    Last scan: 2h ago
~/Desktop           47 files    Last scan: 2h ago
~/Pictures       7,283 files    Last scan: 2h ago

Recent Activity
───────────────
3 batches in undo history (expires in 28 min)
Last operation: "organize downloads by type" (47 files moved)
```

**With --extensions:**
```
File Types
──────────
.jpg     4,521  (36.3%)  ████████████████████
.pdf     1,234  ( 9.9%)  █████
.png       987  ( 7.9%)  ████
.docx      543  ( 4.4%)  ██
.xlsx      321  ( 2.6%)  █
other    4,847  (38.9%)  █████████████████████
```

---

### `filemom search <query>`

Search files by keyword using FTS5.

```bash
filemom search <query> [options]

Arguments:
  query                   Search keywords

Options:
  --limit <n>             Max results (default: 20)
  --ext <extensions>      Filter by extension (comma-separated)
  --folder <path>         Filter by folder prefix
  --after <date>          Modified after date (YYYY-MM-DD)
  --before <date>         Modified before date
  --size-min <bytes>      Minimum file size
  --size-max <bytes>      Maximum file size
  --show-snippets         Show matching text snippets
```

**Output:**
```
Search: "tax documents 2023"
Found 12 results (0.023s)

 #  Name                              Path                           Size      Modified
─────────────────────────────────────────────────────────────────────────────────────────
 1  2023_Tax_Return.pdf               ~/Documents/Taxes/             2.4 MB    2024-02-15
 2  W2_2023_Acme.pdf                  ~/Documents/Taxes/             145 KB    2024-01-20
 3  1099_2023_Freelance.pdf           ~/Documents/Taxes/             89 KB     2024-01-18
 4  Tax_Receipt_2023.pdf              ~/Downloads/                   234 KB    2023-12-28
 ...

Tip: Use --show-snippets to see matching text
```

**With --show-snippets:**
```
 1  2023_Tax_Return.pdf
    ~/Documents/Taxes/ • 2.4 MB • 2024-02-15
    "...Federal Income Tax Return for 2023. Adjusted Gross Income..."

 2  W2_2023_Acme.pdf
    ~/Documents/Taxes/ • 145 KB • 2024-01-20
    "...Wage and Tax Statement 2023. Employer: Acme Corporation..."
```

**JSON output:**
```json
{
  "query": "tax documents 2023",
  "count": 12,
  "durationMs": 23,
  "results": [
    {
      "id": 1234,
      "path": "/Users/nick/Documents/Taxes/2023_Tax_Return.pdf",
      "name": "2023_Tax_Return.pdf",
      "extension": "pdf",
      "size": 2516582,
      "mtime": 1708012800000,
      "score": 0.95,
      "snippet": "...Federal Income Tax Return for 2023..."
    }
  ]
}
```

---

### `filemom info <path>`

Show detailed information about a specific file.

```bash
filemom info <path>

Arguments:
  path                    Path to file (absolute or relative)
```

**Output:**
```
File Information
════════════════

Path:       /Users/nick/Pictures/Hawaii_2017/IMG_4521.jpg
Name:       IMG_4521.jpg
Extension:  jpg
Size:       4.2 MB

Timestamps
──────────
Created:    2017-08-15 14:32:18
Modified:   2017-08-15 14:32:18
Indexed:    2024-03-17 10:45:22

Quick Hash: a3f2c8b1-4194304

EXIF Data
─────────
Date Taken: 2017-08-15 14:32:18
Camera:     Apple iPhone 7 Plus
Dimensions: 4032 x 3024
GPS:        21.3069° N, 157.8583° W (Honolulu, HI)
Orientation: 1 (Normal)

Extracted Text: (none)

Embedding ID: emb_7f8a9b2c (384 dimensions)
```

---

### `filemom plan <command>`

Generate an action plan from a natural language command.

```bash
filemom plan <command> [options]

Arguments:
  command                 Natural language organization command

Options:
  --save <file>           Save plan to JSON file
  --execute               Execute immediately after confirmation
  --dry-run               Show what would happen without executing
  --max-files <n>         Max files to include in context (default: 500)
  --preview               Only show matched files, don't call Claude
```

**Output:**
```
Command: "organize my Hawaii vacation photos by date"

⠸ Searching for relevant files...
  Found 47 files matching "Hawaii" or "vacation"

⠸ Generating action plan with Claude...
  Model: claude-sonnet-4-20250514
  Files in context: 47

✓ Action plan generated

Intent: Organize Hawaii vacation photos into date-based folders

Actions (23 total):
──────────────────────────────────────────────────────────────────────────────

 1. CREATE FOLDER
    ~/Pictures/Hawaii_2017/2017-08-15/
    Reason: Group photos from August 15, 2017
    Confidence: 0.95 ✓

 2. MOVE FILE
    From: ~/Pictures/Hawaii_2017/IMG_4521.jpg
    To:   ~/Pictures/Hawaii_2017/2017-08-15/IMG_4521.jpg
    Reason: Photo taken on 2017-08-15 (EXIF date)
    Confidence: 0.98 ✓

 3. MOVE FILE
    From: ~/Pictures/Hawaii_2017/IMG_4522.jpg
    To:   ~/Pictures/Hawaii_2017/2017-08-15/IMG_4522.jpg
    Reason: Photo taken on 2017-08-15 (EXIF date)
    Confidence: 0.98 ✓

... (20 more actions)

⚠ Needs Review (2 items):
──────────────────────────────────────────────────────────────────────────────

 18. MOVE FILE
     From: ~/Downloads/beach_photo.jpg
     To:   ~/Pictures/Hawaii_2017/2017-08-16/beach_photo.jpg
     Reason: Filename suggests beach, might be from Hawaii trip
     Confidence: 0.62 ⚠

 21. MOVE FILE
     From: ~/Desktop/sunset.png
     To:   ~/Pictures/Hawaii_2017/Unknown_Date/sunset.png
     Reason: Could be Hawaii sunset, no EXIF data
     Confidence: 0.45 ⚠

Summary
───────
Files to move:     21
Folders to create:  4
Total size:        89.4 MB

Warnings:
  • 2 files have low confidence and need review
  • 3 files have no EXIF date, placed in "Unknown_Date" folder

─────────────────────────────────────────────────────────────────────────────

? What would you like to do?
  › Execute all actions
    Execute only high-confidence actions (skip 2)
    Save plan to file
    Cancel
```

**With --save:**
```
✓ Plan saved to: hawaii_plan.json

To execute later:
  filemom execute hawaii_plan.json
```

**With --preview:**
```
Command: "organize my Hawaii vacation photos"

Preview: Files that would be included
─────────────────────────────────────

 #  Name                   Path                              Size      Date
────────────────────────────────────────────────────────────────────────────
 1  IMG_4521.jpg           ~/Pictures/Hawaii_2017/           4.2 MB    2017-08-15
 2  IMG_4522.jpg           ~/Pictures/Hawaii_2017/           3.8 MB    2017-08-15
 3  IMG_4523.jpg           ~/Pictures/Hawaii_2017/           4.1 MB    2017-08-15
...

47 files would be sent to Claude for planning.
Estimated API cost: ~$0.02

Use without --preview to generate the actual plan.
```

---

### `filemom execute <file>`

Execute a saved action plan.

```bash
filemom execute <file> [options]

Arguments:
  file                    Path to plan JSON file

Options:
  --dry-run               Show what would happen without executing
  --skip-review           Skip items marked as needs_review
  --force                 Don't ask for confirmation
```

**Output:**
```
Loading plan: hawaii_plan.json

Plan: Organize Hawaii vacation photos by date
Created: 5 minutes ago
Actions: 23 (21 moves, 2 folder creations)

? Execute this plan? (Y/n) y

Executing...
──────────────

 [1/23] Creating folder: ~/Pictures/Hawaii_2017/2017-08-15/
        ✓ Created

 [2/23] Moving: IMG_4521.jpg → 2017-08-15/IMG_4521.jpg
        ✓ Moved (4.2 MB)

 [3/23] Moving: IMG_4522.jpg → 2017-08-15/IMG_4522.jpg
        ✓ Moved (3.8 MB)

...

[23/23] Moving: sunset.png → Unknown_Date/sunset.png
        ✓ Moved (1.2 MB)

══════════════════════════════════════════════════════════════════════════

Execution Complete
──────────────────
Succeeded:  23
Failed:      0
Duration:   4.2s
Batch ID:   batch_a7f2c3b1

To undo: filemom undo batch_a7f2c3b1
Undo expires in: 30 minutes
```

**With partial failure:**
```
Executing...
──────────────

 [1/23] Creating folder: ~/Pictures/Hawaii_2017/2017-08-15/
        ✓ Created

 [2/23] Moving: IMG_4521.jpg → 2017-08-15/IMG_4521.jpg
        ✗ Failed: Permission denied

 [3/23] Moving: IMG_4522.jpg → 2017-08-15/IMG_4522.jpg
        ✓ Moved (3.8 MB)

...

══════════════════════════════════════════════════════════════════════════

Execution Complete (with errors)
────────────────────────────────
Succeeded:  21
Failed:      2
Duration:   4.8s

Failed actions:
  2. IMG_4521.jpg - Permission denied
  7. document.pdf - File in use by another application

Batch ID: batch_a7f2c3b1
Successful operations can still be undone.
```

---

### `filemom history`

Show recent operation batches.

```bash
filemom history [options]

Options:
  --limit <n>             Number of batches to show (default: 10)
  --all                   Include expired/undone batches
  --batch <id>            Show details for specific batch
```

**Output:**
```
Recent Operations
═════════════════

 #  Batch ID          Intent                              Files   Status      Expires
─────────────────────────────────────────────────────────────────────────────────────
 1  batch_a7f2c3b1    organize Hawaii photos by date        23    ✓ Active    28 min
 2  batch_b8e3d4c2    sort downloads by type                47    ✓ Active    15 min
 3  batch_c9f4e5d3    move tax documents to folder          12    ↩ Undone    -

To undo a batch: filemom undo <batch-id>
```

**With --batch:**
```
Batch Details: batch_a7f2c3b1
═════════════════════════════

Intent:     organize Hawaii photos by date
Executed:   2024-03-17 10:45:22 (5 minutes ago)
Status:     Active (can undo)
Expires:    2024-03-17 11:15:22 (25 minutes)

Actions:
────────
 1. CREATE ~/Pictures/Hawaii_2017/2017-08-15/     ✓ Completed
 2. MOVE   IMG_4521.jpg → 2017-08-15/             ✓ Completed
 3. MOVE   IMG_4522.jpg → 2017-08-15/             ✓ Completed
 ...

To undo: filemom undo batch_a7f2c3b1
```

---

### `filemom undo [batch-id]`

Undo an operation batch.

```bash
filemom undo [batch-id] [options]

Arguments:
  batch-id                Batch to undo (default: most recent)

Options:
  --force                 Don't ask for confirmation
```

**Output:**
```
Undo: batch_a7f2c3b1
═══════════════════

Intent: organize Hawaii photos by date
Actions to reverse: 23

? Undo this batch? This will:
  • Move 21 files back to original locations
  • Delete 2 created folders (if empty)

  (Y/n) y

Undoing...
──────────

 [1/23] Moving back: 2017-08-15/IMG_4521.jpg → IMG_4521.jpg
        ✓ Restored

 [2/23] Moving back: 2017-08-15/IMG_4522.jpg → IMG_4522.jpg
        ✓ Restored

...

[23/23] Deleting folder: ~/Pictures/Hawaii_2017/2017-08-15/
        ✓ Deleted (was empty)

══════════════════════════════════════════════════════════════════════════

Undo Complete
─────────────
Restored:   21 files
Deleted:     2 folders
Duration:   3.8s
```

---

### `filemom config`

Manage configuration.

```bash
filemom config <action> [key] [value]

Actions:
  list                    Show all configuration
  get <key>               Get a configuration value
  set <key> <value>       Set a configuration value
  reset                   Reset to defaults
  path                    Show config file path
```

**Output:**
```
$ filemom config list

FileMom Configuration
═════════════════════

Location: ~/.filemom/config.json

Setting                  Value
─────────────────────────────────────────────────
watchedFolders           ~/Documents, ~/Downloads, ~/Desktop
excludePatterns          **/node_modules/**, **/.git/**
model                    claude-sonnet-4-20250514
maxFilesPerRequest       500
undoTTLMinutes           30
enableEmbeddings         false

$ filemom config set model claude-haiku-4-20250514
✓ Set model = claude-haiku-4-20250514
```

---

### Debug Commands

#### `filemom extract <file>`

Test metadata extraction on a single file.

```bash
$ filemom extract ~/Documents/report.pdf

Extracting: report.pdf
═══════════════════════

Quick Hash: b7c8d9e0-1048576

Extracted Text (first 500 chars):
──────────────────────────────────
"Quarterly Financial Report Q4 2023

Executive Summary
This report summarizes the financial performance of Acme Corporation
for the fourth quarter of 2023. Key highlights include:

• Revenue increased 15% year-over-year
• Operating margin improved to 23%
• Customer acquisition cost decreased by 12%

..."

(Total extracted: 8,432 characters)

Extraction time: 234ms
```

#### `filemom hash <file>`

Show quick hash for a file.

```bash
$ filemom hash ~/photo.jpg

File: ~/photo.jpg
Size: 4,194,304 bytes (4.0 MB)
Quick Hash: a3f2c8b1-4194304
Hash Time: 2ms
```

#### `filemom db`

Open SQLite shell for direct database access.

```bash
$ filemom db

Opening: ~/.filemom/index.db
SQLite version 3.42.0

sqlite> SELECT COUNT(*) FROM files;
12453

sqlite> SELECT extension, COUNT(*) FROM files GROUP BY extension ORDER BY 2 DESC LIMIT 5;
jpg|4521
pdf|1234
png|987
docx|543
xlsx|321

sqlite> .quit
```

#### `filemom watch`

Run the file watcher in foreground (for debugging).

```bash
$ filemom watch

Watching 4 folders...
Press Ctrl+C to stop

[10:45:22] FILE CREATED  ~/Downloads/invoice.pdf
[10:45:23] INDEXED       ~/Downloads/invoice.pdf (234 KB, PDF)
[10:46:01] FILE MODIFIED ~/Documents/notes.txt
[10:46:01] UPDATED       ~/Documents/notes.txt (hash changed)
[10:47:15] FILE DELETED  ~/Desktop/temp.txt
[10:47:15] REMOVED       ~/Desktop/temp.txt (from index)
^C

Watcher stopped.
```

---

## Output Modes

### Pretty Mode (Default)

- Colored output with emoji indicators
- Progress spinners for long operations
- Tables for structured data
- Interactive prompts for confirmations

### JSON Mode (`--json`)

- Machine-readable JSON output
- No colors, spinners, or interactive prompts
- Suitable for scripting and piping

```bash
# Pipe search results to jq
filemom search "tax" --json | jq '.results[].path'

# Save plan for later
filemom plan "organize downloads" --json > plan.json

# Check status in script
if filemom status --json | jq -e '.totalFiles > 0' > /dev/null; then
  echo "Index has files"
fi
```

### Quiet Mode (`--quiet`)

- Minimal output (errors only)
- Exit codes indicate success/failure
- Useful for cron jobs and scripts

```bash
# Silent scan, check exit code
filemom scan --quiet && echo "Scan succeeded"
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | File not found |
| 4 | Permission denied |
| 5 | Database error |
| 6 | API error (Claude) |
| 7 | Validation error |
| 8 | User cancelled |

---

## Example Workflows

### Initial Setup

```bash
# Initialize
filemom init

# Add folders
filemom add ~/Documents
filemom add ~/Downloads
filemom add ~/Pictures

# Full scan with extraction
filemom scan --extract

# Check status
filemom status --detailed
```

### Daily Usage

```bash
# Quick search
filemom search "invoice march"

# Organize with AI
filemom plan "sort my downloads by file type" --execute

# Check what happened
filemom history

# Oops, undo
filemom undo
```

### Scripting

```bash
#!/bin/bash
# Daily organization script

# Scan for new files
filemom scan --quiet

# Get count of new downloads
NEW_FILES=$(filemom search "" --folder ~/Downloads --after $(date -v-1d +%Y-%m-%d) --json | jq '.count')

if [ "$NEW_FILES" -gt 10 ]; then
  echo "Found $NEW_FILES new downloads, organizing..."
  filemom plan "organize downloads by type" --json --save /tmp/plan.json
  filemom execute /tmp/plan.json --force
fi
```

### Debugging

```bash
# Test extraction on problem file
filemom extract ~/weird_file.pdf

# Check if file is indexed
filemom info ~/Documents/report.pdf

# Direct database query
filemom db
sqlite> SELECT * FROM files WHERE path LIKE '%report%';

# Watch file changes in real-time
filemom watch
```

---

## Color Scheme

| Element | Color | Usage |
|---------|-------|-------|
| Success | Green | ✓ checkmarks, completed actions |
| Error | Red | ✗ failures, errors |
| Warning | Yellow | ⚠ needs review, low confidence |
| Info | Blue | ℹ informational messages |
| Path | Cyan | File and folder paths |
| Dim | Gray | Secondary information, hints |

---

## Configuration File

Location: `~/.filemom/config.json`

```json
{
  "watchedFolders": [
    "/Users/nick/Documents",
    "/Users/nick/Downloads",
    "/Users/nick/Pictures"
  ],
  "excludePatterns": [
    "**/node_modules/**",
    "**/.git/**",
    "**/.*"
  ],
  "model": "claude-sonnet-4-20250514",
  "maxFilesPerRequest": 500,
  "undoTTLMinutes": 30,
  "enableEmbeddings": false
}
```

---

## Dependencies

```json
{
  "dependencies": {
    "@filemom/engine": "workspace:*",
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "inquirer": "^9.2.0",
    "cli-table3": "^0.6.0",
    "dotenv": "^16.4.0"
  }
}
```

---

## Future Enhancements

- [ ] Tab completion for paths and commands
- [ ] `--watch` flag for continuous operation
- [ ] `filemom diff <plan>` - show plan changes since generation
- [ ] `filemom replay <batch>` - re-run a historical batch
- [ ] `filemom export` - export index to CSV/JSON
- [ ] `filemom import` - import from another FileMom instance
- [ ] Plugin system for custom commands
