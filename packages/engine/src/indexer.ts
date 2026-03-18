import type { FileRecord, SearchResult, SearchOptions } from './types.js';

export interface IndexerConfig {
  dbPath: string;
}

// TODO: Implement in Phase 2
export class Indexer {
  constructor(private _config: IndexerConfig) {}

  async initialize(): Promise<void> {
    // Phase 2: create tables, FTS5 virtual table, triggers
  }

  async close(): Promise<void> {
    // Phase 2: close database connection
  }

  async upsertFile(_record: FileRecord): Promise<void> {
    // Phase 2: insert or update file record
  }

  async deleteFile(_path: string): Promise<void> {
    // Phase 2: remove file record and FTS entry
  }

  async getByPath(_path: string): Promise<FileRecord | null> {
    // Phase 2: lookup by absolute path
    return null;
  }

  async search(_query: string, _options?: SearchOptions): Promise<SearchResult[]> {
    // Phase 2: FTS5 keyword search
    return [];
  }
}
