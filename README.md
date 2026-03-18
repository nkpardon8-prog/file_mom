# FileMom Engine

AI-powered file organization backend. Natural language commands → organized files.

## What is this?

FileMom is a file organization tool that lets users describe what they want in plain English:

- *"Put all my Hawaii photos on the Desktop"*
- *"Organize my Downloads by file type"*
- *"Find all my tax documents and put them together"*

This repository contains the **backend engine** — a Node.js/TypeScript library that handles:

- File scanning and metadata extraction
- SQLite-based file indexing with full-text search
- AI-powered organization planning via Claude
- Safe file operations with undo support

## Project Status

**Phase: Planning Complete, Ready for Implementation**

See [`/docs`](./docs/) for full specifications:

- [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — System design and components
- [`SCHEMAS.md`](./docs/SCHEMAS.md) — Database schemas, TypeScript types, Claude prompts
- [`API.md`](./docs/API.md) — Public API documentation
- [`IMPLEMENTATION.md`](./docs/IMPLEMENTATION.md) — Build order and milestones

## Quick Start (After Implementation)

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run CLI
pnpm cli scan ~/Documents ~/Downloads
pnpm cli search "tax documents"
pnpm cli plan "organize my downloads"
```

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                 FileMom Engine                   │
├─────────────────────────────────────────────────┤
│  Scanner → Extractor → Indexer (SQLite)         │
│                    ↓                             │
│  User Command → AI Interface → Action Plan       │
│                    ↓                             │
│  Executor → Transaction Log → Undo               │
└─────────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| No external binaries | Pure JS extraction | Simple install, no PATH issues |
| Copy-then-delete | Never `fs.rename()` | Safe, reversible, cross-volume |
| SQLite + FTS5 | Keyword search | Fast, embedded, battle-tested |
| 30-minute undo | Transaction log | Balance UX vs storage |
| Staged scanning | Quick scan → deep extract | Responsive UX |

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.4+
- **Database:** SQLite via better-sqlite3
- **AI:** Claude Sonnet via @anthropic-ai/sdk
- **File watching:** chokidar
- **Testing:** Vitest

## Project Structure

```
filemom/
├── packages/
│   └── engine/          # Core backend library
├── apps/
│   └── cli/             # Development CLI
└── docs/                # Specifications
```

## Contributing

This is currently a private project. See IMPLEMENTATION.md for the development roadmap.

## License

Proprietary - VeriTek AI
