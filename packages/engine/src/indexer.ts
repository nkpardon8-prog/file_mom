import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { FileRecord, SearchResult, SearchOptions, IndexStats, HybridSearchResult, SemanticSearchOptions } from './types.js';
import type { Embeddings } from './embeddings.js';

export interface IndexerConfig {
  dbPath: string;
  embeddingDimensions?: number;
}

const SCHEMA_VERSION = 3;

export class Indexer {
  private _db: Database.Database | null = null;

  constructor(private _config: IndexerConfig) {}

  private get db(): Database.Database {
    if (!this._db) throw new Error('Indexer not initialized. Call initialize() first.');
    return this._db;
  }

  async initialize(): Promise<void> {
    this._db = new Database(this._config.dbPath);

    // Performance pragmas
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');
    this._db.pragma('foreign_keys = ON');
    this._db.pragma('temp_store = MEMORY');
    this._db.pragma('cache_size = -64000');
    this._db.pragma('busy_timeout = 5000');

    // Load sqlite-vec extension for vector search
    sqliteVec.load(this._db);

    this._migrate();
  }

  async close(): Promise<void> {
    if (this._db) {
      this._db.pragma('optimize');
      this._db.close();
      this._db = null;
    }
  }

  // ============================================================
  // CRUD
  // ============================================================

  async upsertFile(record: FileRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO files (
        path, name, extension, size, mtime, ctime,
        quick_hash, extracted_text, exif_json, detected_mime, indexed_at, embedding_id,
        vision_description, vision_category, vision_tags, enriched_at
      ) VALUES (
        @path, @name, @extension, @size, @mtime, @ctime,
        @quickHash, @extractedText, @exifJson, @detectedMimeType, @indexedAt, @embeddingId,
        @visionDescription, @visionCategory, @visionTags, @enrichedAt
      )
      ON CONFLICT(path) DO UPDATE SET
        name = @name,
        extension = @extension,
        size = @size,
        mtime = @mtime,
        ctime = @ctime,
        quick_hash = @quickHash,
        extracted_text = @extractedText,
        exif_json = @exifJson,
        detected_mime = @detectedMimeType,
        indexed_at = @indexedAt,
        embedding_id = @embeddingId,
        vision_description = @visionDescription,
        vision_category = @visionCategory,
        vision_tags = @visionTags,
        enriched_at = @enrichedAt
    `);

    stmt.run({
      path: record.path,
      name: record.name,
      extension: record.extension,
      size: record.size,
      mtime: record.mtime,
      ctime: record.ctime,
      quickHash: record.quickHash,
      extractedText: record.extractedText,
      exifJson: record.exifJson,
      detectedMimeType: record.detectedMimeType,
      indexedAt: record.indexedAt,
      embeddingId: record.embeddingId,
      visionDescription: record.visionDescription,
      visionCategory: record.visionCategory,
      visionTags: record.visionTags,
      enrichedAt: record.enrichedAt,
    });
  }

  async upsertFiles(records: FileRecord[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO files (
        path, name, extension, size, mtime, ctime,
        quick_hash, extracted_text, exif_json, detected_mime, indexed_at, embedding_id,
        vision_description, vision_category, vision_tags, enriched_at
      ) VALUES (
        @path, @name, @extension, @size, @mtime, @ctime,
        @quickHash, @extractedText, @exifJson, @detectedMimeType, @indexedAt, @embeddingId,
        @visionDescription, @visionCategory, @visionTags, @enrichedAt
      )
      ON CONFLICT(path) DO UPDATE SET
        name = @name, extension = @extension, size = @size,
        mtime = @mtime, ctime = @ctime, quick_hash = @quickHash,
        extracted_text = @extractedText, exif_json = @exifJson,
        detected_mime = @detectedMimeType, indexed_at = @indexedAt, embedding_id = @embeddingId,
        vision_description = @visionDescription, vision_category = @visionCategory,
        vision_tags = @visionTags, enriched_at = @enrichedAt
    `);
    const upsert = this.db.transaction((items: FileRecord[]) => {
      for (const record of items) {
        stmt.run({
          path: record.path,
          name: record.name,
          extension: record.extension,
          size: record.size,
          mtime: record.mtime,
          ctime: record.ctime,
          quickHash: record.quickHash,
          extractedText: record.extractedText,
          exifJson: record.exifJson,
          detectedMimeType: record.detectedMimeType,
          indexedAt: record.indexedAt,
          embeddingId: record.embeddingId,
          visionDescription: record.visionDescription,
          visionCategory: record.visionCategory,
          visionTags: record.visionTags,
          enrichedAt: record.enrichedAt,
        });
      }
    });
    upsert(records);
  }

  async deleteFile(path: string): Promise<void> {
    const record = this.db.prepare('SELECT id FROM files WHERE path = ?').get(path) as { id: number } | undefined;
    this.db.prepare('DELETE FROM files WHERE path = ?').run(path);
    if (record) {
      try {
        this.db.prepare('DELETE FROM file_embeddings WHERE rowid = ?').run(BigInt(record.id));
      } catch {
        // file_embeddings may not exist if embeddings never initialized
      }
    }
  }

  async getByPath(path: string): Promise<FileRecord | null> {
    const row = this.db.prepare('SELECT * FROM files WHERE path = ?').get(path) as RawFileRow | undefined;
    return row ? this._rowToRecord(row) : null;
  }

  async getByHash(hash: string): Promise<FileRecord[]> {
    const rows = this.db.prepare('SELECT * FROM files WHERE quick_hash = ?').all(hash) as RawFileRow[];
    return rows.map((r) => this._rowToRecord(r));
  }

  // ============================================================
  // Search
  // ============================================================

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const sanitized = this._sanitizeQuery(query);
    if (!sanitized) return [];

    const limit = options?.limit ?? 100;
    const conditions: string[] = [];
    const params: Record<string, unknown> = { query: sanitized, limit };

    if (options?.extensions?.length) {
      const placeholders = options.extensions.map((_, i) => `@ext${i}`);
      conditions.push(`f.extension IN (${placeholders.join(',')})`);
      options.extensions.forEach((ext, i) => { params[`ext${i}`] = ext; });
    }
    if (options?.folders?.length) {
      const folderConds = options.folders.map((_, i) => `f.path LIKE @folder${i} ESCAPE '\\'`);
      conditions.push(`(${folderConds.join(' OR ')})`);
      options.folders.forEach((folder, i) => { params[`folder${i}`] = `${this._escapeLike(folder)}%`; });
    }
    if (options?.minSize != null) {
      conditions.push('f.size >= @minSize');
      params.minSize = options.minSize;
    }
    if (options?.maxSize != null) {
      conditions.push('f.size <= @maxSize');
      params.maxSize = options.maxSize;
    }
    if (options?.modifiedAfter) {
      conditions.push('f.mtime >= @modifiedAfter');
      params.modifiedAfter = options.modifiedAfter.getTime();
    }
    if (options?.modifiedBefore) {
      conditions.push('f.mtime <= @modifiedBefore');
      params.modifiedBefore = options.modifiedBefore.getTime();
    }

    const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        f.id, f.path, f.name, f.extension, f.size, f.mtime,
        bm25(files_fts, 10.0, 1.0, 2.0, 5.0) AS score,
        snippet(files_fts, 1, '<<', '>>', '...', 32) AS snippet
      FROM files_fts
      JOIN files f ON f.id = files_fts.rowid
      WHERE files_fts MATCH @query ${where}
      ORDER BY score
      LIMIT @limit
    `;

    const rows = this.db.prepare(sql).all(params) as Array<{
      id: number; path: string; name: string; extension: string;
      size: number; mtime: number; score: number; snippet: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      name: r.name,
      extension: r.extension,
      size: r.size,
      mtime: r.mtime,
      score: r.score,
      snippet: r.snippet,
    }));
  }

  // ============================================================
  // Queries
  // ============================================================

  async getAllByExtension(ext: string): Promise<FileRecord[]> {
    const rows = this.db.prepare('SELECT * FROM files WHERE extension = ?').all(ext) as RawFileRow[];
    return rows.map((r) => this._rowToRecord(r));
  }

  async getRecent(limit: number = 50): Promise<FileRecord[]> {
    const rows = this.db.prepare('SELECT * FROM files ORDER BY mtime DESC LIMIT ?').all(limit) as RawFileRow[];
    return rows.map((r) => this._rowToRecord(r));
  }

  async getUnenriched(options: { extensions?: string[]; minTextThreshold?: number; limit?: number } = {}): Promise<FileRecord[]> {
    const exts = options.extensions ?? ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'avif', 'pdf'];
    const threshold = options.minTextThreshold ?? 50;
    const limit = options.limit ?? 50;

    const placeholders = exts.map(() => '?').join(',');
    const sql = `SELECT * FROM files
      WHERE enriched_at IS NULL
        AND extension IN (${placeholders})
        AND (extracted_text IS NULL OR LENGTH(extracted_text) < ?)
      ORDER BY mtime DESC
      LIMIT ?`;

    const rows = this.db.prepare(sql).all(...exts, threshold, limit) as RawFileRow[];
    return rows.map((r) => this._rowToRecord(r));
  }

  async getUnenrichedCount(options: { extensions?: string[]; minTextThreshold?: number } = {}): Promise<number> {
    const exts = options.extensions ?? ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'avif', 'pdf'];
    const threshold = options.minTextThreshold ?? 50;
    const placeholders = exts.map(() => '?').join(',');
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM files WHERE enriched_at IS NULL AND extension IN (${placeholders}) AND (extracted_text IS NULL OR LENGTH(extracted_text) < ?)`,
    ).get(...exts, threshold) as { cnt: number };
    return row.cnt;
  }

  async getUnembeddedCount(): Promise<number> {
    try {
      const row = this.db.prepare(
        `SELECT COUNT(*) as cnt FROM files f LEFT JOIN file_embeddings fe ON f.id = fe.rowid WHERE fe.rowid IS NULL AND (f.extracted_text IS NOT NULL OR f.vision_description IS NOT NULL)`,
      ).get() as { cnt: number };
      return row.cnt;
    } catch {
      return 0;
    }
  }

  async getTopFolders(limit: number = 50): Promise<string[]> {
    const rows = this.db.prepare(
      `SELECT SUBSTR(path, 1, LENGTH(path) - LENGTH(name) - 1) as folder
       FROM files
       GROUP BY folder
       ORDER BY COUNT(*) DESC
       LIMIT ?`,
    ).all(limit) as Array<{ folder: string }>;
    return rows.map((r) => r.folder);
  }

  async searchByPath(pathPattern: string, options?: { limit?: number }): Promise<FileRecord[]> {
    const limit = options?.limit ?? 100;
    const escaped = this._escapeLike(pathPattern);
    const rows = this.db.prepare(
      "SELECT * FROM files WHERE path LIKE ? ESCAPE '\\' ORDER BY mtime DESC LIMIT ?",
    ).all(`%${escaped}%`, limit) as RawFileRow[];
    return rows.map((r) => this._rowToRecord(r));
  }

  async getPathsInFolder(folder: string): Promise<string[]> {
    const escaped = this._escapeLike(folder);
    const rows = this.db.prepare(
      "SELECT path FROM files WHERE path LIKE ? ESCAPE '\\'",
    ).all(`${escaped}/%`) as Array<{ path: string }>;
    return rows.map((r) => r.path);
  }

  async getFileCountInFolder(folder: string): Promise<number> {
    const escaped = this._escapeLike(folder);
    const row = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM files WHERE path LIKE ? ESCAPE '\\'",
    ).get(`${escaped}/%`) as { cnt: number };
    return row.cnt;
  }

  async getById(id: number): Promise<FileRecord | null> {
    const row = this.db.prepare('SELECT * FROM files WHERE id = ?').get(id) as RawFileRow | undefined;
    return row ? this._rowToRecord(row) : null;
  }

  async getUnembedded(options?: { limit?: number }): Promise<FileRecord[]> {
    const limit = options?.limit ?? 100;
    try {
      const sql = `
        SELECT f.* FROM files f
        LEFT JOIN file_embeddings fe ON f.id = fe.rowid
        WHERE fe.rowid IS NULL
          AND (f.extracted_text IS NOT NULL OR f.vision_description IS NOT NULL)
        ORDER BY f.mtime DESC
        LIMIT ?
      `;
      const rows = this.db.prepare(sql).all(limit) as RawFileRow[];
      return rows.map((r) => this._rowToRecord(r));
    } catch {
      // file_embeddings table may not exist
      return [];
    }
  }

  async hybridSearch(
    query: string,
    embeddings: Embeddings,
    options?: SemanticSearchOptions,
  ): Promise<HybridSearchResult[]> {
    const ftsWeight = options?.ftsWeight ?? 0.3;
    const vectorWeight = options?.vectorWeight ?? 0.7;
    const limit = options?.limit ?? 20;

    // FTS5 keyword search
    const ftsResults = await this.search(query, { ...options, limit: limit * 3 });

    // Vector similarity search
    let vectorResults: Array<{ fileId: number; distance: number }> = [];
    try {
      vectorResults = await embeddings.search(query, { limit: limit * 3 });
    } catch {
      // Embedding generation may fail for short/empty queries
    }

    // Normalize FTS5 scores to 0-1 (BM25 scores are negative, lower = better)
    const ftsMap = new Map<number, { score: number; row: (typeof ftsResults)[0] }>();
    if (ftsResults.length > 0) {
      const best = Math.abs(ftsResults[0].score);
      const worst = Math.abs(ftsResults[ftsResults.length - 1].score);
      for (const r of ftsResults) {
        const normalized = best === worst ? 1 : (Math.abs(r.score) - worst) / (best - worst);
        ftsMap.set(r.id, { score: normalized, row: r });
      }
    }

    // Convert L2 distance to cosine similarity for normalized vectors
    const vecMap = new Map<number, number>();
    for (const r of vectorResults) {
      const similarity = Math.max(0, 1 - (r.distance * r.distance) / 2);
      vecMap.set(r.fileId, similarity);
    }

    // Merge candidates
    const allIds = new Set([...ftsMap.keys(), ...vecMap.keys()]);
    const combined: HybridSearchResult[] = [];

    for (const id of allIds) {
      const ftsEntry = ftsMap.get(id);
      const ftsScore = ftsEntry?.score ?? 0;
      const vecScore = vecMap.get(id) ?? 0;
      const combinedScore = ftsWeight * ftsScore + vectorWeight * vecScore;

      if (options?.minScore && combinedScore < options.minScore) continue;

      if (ftsEntry) {
        combined.push({
          id,
          path: ftsEntry.row.path,
          name: ftsEntry.row.name,
          extension: ftsEntry.row.extension,
          size: ftsEntry.row.size,
          mtime: ftsEntry.row.mtime,
          ftsScore,
          vectorScore: vecScore,
          combinedScore,
          snippet: ftsEntry.row.snippet,
        });
      } else {
        const record = await this.getById(id);
        if (record) {
          combined.push({
            id,
            path: record.path,
            name: record.name,
            extension: record.extension,
            size: record.size,
            mtime: record.mtime,
            ftsScore: 0,
            vectorScore: vecScore,
            combinedScore,
            snippet: null,
          });
        }
      }
    }

    combined.sort((a, b) => b.combinedScore - a.combinedScore);
    return combined.slice(0, limit);
  }

  async getStats(): Promise<IndexStats> {
    const total = this.db.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(size), 0) as totalSize FROM files').get() as { cnt: number; totalSize: number };
    const oldest = this.db.prepare('SELECT MIN(mtime) as val FROM files').get() as { val: number | null };
    const newest = this.db.prepare('SELECT MAX(mtime) as val FROM files').get() as { val: number | null };
    const lastScan = this.db.prepare('SELECT MAX(indexed_at) as val FROM files').get() as { val: number | null };

    const extRows = this.db.prepare('SELECT extension, COUNT(*) as cnt FROM files GROUP BY extension ORDER BY cnt DESC').all() as Array<{ extension: string; cnt: number }>;
    const byExtension: Record<string, number> = {};
    for (const row of extRows) {
      byExtension[row.extension] = row.cnt;
    }

    return {
      totalFiles: total.cnt,
      totalSize: total.totalSize,
      byExtension,
      oldestFile: oldest.val ? new Date(oldest.val) : new Date(0),
      newestFile: newest.val ? new Date(newest.val) : new Date(0),
      lastScanAt: lastScan.val ? new Date(lastScan.val) : null,
      watchedFolders: [],
    };
  }

  async getFileCount(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM files').get() as { cnt: number };
    return row.cnt;
  }

  // ============================================================
  // Query helpers
  // ============================================================

  private _escapeLike(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
  }

  private _sanitizeQuery(query: string): string {
    // Strip all FTS5 syntax characters
    let sanitized = query.replace(/[*"^{}()\\:\/]/g, ' ').trim();
    sanitized = sanitized.replace(/\s+/g, ' ');
    if (!sanitized) return '';
    // Remove standalone FTS5 boolean operators
    const tokens = sanitized.split(' ').filter(
      (t) => !['OR', 'AND', 'NOT', 'NEAR'].includes(t.toUpperCase()) && t.length > 0,
    );
    if (tokens.length === 0) return '';
    // Quote each token to prevent FTS5 interpretation
    return tokens.map((t) => `"${t}"`).join(' ');
  }

  // ============================================================
  // Migration
  // ============================================================

  private _migrate(): void {
    const currentVersion = this.db.pragma('user_version', { simple: true }) as number;

    if (currentVersion < SCHEMA_VERSION) {
      this._applyMigrations(currentVersion);
    }
  }

  private _applyMigrations(fromVersion: number): void {
    const migrate = this.db.transaction(() => {
      if (fromVersion < 1) this._migrationV1();
      if (fromVersion < 2) this._migrationV2();
      if (fromVersion < 3) this._migrationV3();
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    });
    migrate();
  }

  private _migrationV3(): void {
    // Add detected MIME type column for content-based file type identification
    this.db.exec(`ALTER TABLE files ADD COLUMN detected_mime TEXT`);
  }

  private _migrationV2(): void {
    const dims = this._config.embeddingDimensions ?? 384;
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_embeddings USING vec0(
        embedding float[${dims}]
      );
    `);
  }

  private _migrationV1(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        path              TEXT NOT NULL UNIQUE,
        name              TEXT NOT NULL,
        extension         TEXT NOT NULL,
        size              INTEGER NOT NULL,
        mtime             INTEGER NOT NULL,
        ctime             INTEGER NOT NULL,
        quick_hash        TEXT,
        extracted_text    TEXT,
        exif_json         TEXT,
        indexed_at        INTEGER NOT NULL,
        embedding_id      TEXT,
        vision_description TEXT,
        vision_category   TEXT,
        vision_tags       TEXT,
        enriched_at       INTEGER,

        CONSTRAINT valid_size CHECK (size >= 0),
        CONSTRAINT valid_mtime CHECK (mtime > 0),
        CONSTRAINT valid_ctime CHECK (ctime > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
      CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime DESC);
      CREATE INDEX IF NOT EXISTS idx_files_name ON files(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_files_indexed_at ON files(indexed_at);
      CREATE INDEX IF NOT EXISTS idx_files_enriched_at ON files(enriched_at);

      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        name,
        extracted_text,
        path,
        vision_description,
        content='files',
        content_rowid='id',
        tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
        INSERT INTO files_fts(rowid, name, extracted_text, path, vision_description)
        VALUES (new.id, new.name, COALESCE(new.extracted_text, ''), new.path, COALESCE(new.vision_description, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
        INSERT INTO files_fts(files_fts, rowid, name, extracted_text, path, vision_description)
        VALUES ('delete', old.id, old.name, COALESCE(old.extracted_text, ''), old.path, COALESCE(old.vision_description, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
        INSERT INTO files_fts(files_fts, rowid, name, extracted_text, path, vision_description)
        VALUES ('delete', old.id, old.name, COALESCE(old.extracted_text, ''), old.path, COALESCE(old.vision_description, ''));
        INSERT INTO files_fts(rowid, name, extracted_text, path, vision_description)
        VALUES (new.id, new.name, COALESCE(new.extracted_text, ''), new.path, COALESCE(new.vision_description, ''));
      END;
    `);
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  private _rowToRecord(row: RawFileRow): FileRecord {
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      extension: row.extension,
      size: row.size,
      mtime: row.mtime,
      ctime: row.ctime,
      quickHash: row.quick_hash ?? '',
      extractedText: row.extracted_text,
      exifJson: row.exif_json,
      detectedMimeType: row.detected_mime,
      indexedAt: row.indexed_at,
      embeddingId: row.embedding_id,
      visionDescription: row.vision_description,
      visionCategory: row.vision_category,
      visionTags: row.vision_tags,
      enrichedAt: row.enriched_at,
    };
  }
}

/** Raw row shape from SQLite (snake_case columns) */
interface RawFileRow {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  ctime: number;
  quick_hash: string | null;
  extracted_text: string | null;
  exif_json: string | null;
  detected_mime: string | null;
  indexed_at: number;
  embedding_id: string | null;
  vision_description: string | null;
  vision_category: string | null;
  vision_tags: string | null;
  enriched_at: number | null;
}
