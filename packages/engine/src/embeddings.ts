import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { EmbeddingError } from './errors.js';
import type { EmbeddingResult } from './types.js';

export interface EmbeddingsConfig {
  model: string;
  dimensions: number;
  dbPath: string;
  cacheDir?: string;
}

export class Embeddings {
  private _db: Database.Database | null = null;
  private _pipeline: ((text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>) | null = null;
  private _config: EmbeddingsConfig;

  constructor(config: EmbeddingsConfig) {
    this._config = config;
  }

  private get db(): Database.Database {
    if (!this._db) throw new EmbeddingError('Embeddings not initialized. Call initialize() first.');
    return this._db;
  }

  async initialize(): Promise<void> {
    if (this._db) return;

    this._db = new Database(this._config.dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('busy_timeout = 5000');

    sqliteVec.load(this._db);

    this._db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_embeddings USING vec0(
        embedding float[${this._config.dimensions}]
      );
    `);

    const cacheDir = this._config.cacheDir ?? join(homedir(), '.filemom', 'models');
    await mkdir(cacheDir, { recursive: true });

    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = cacheDir;
    this._pipeline = await pipeline('feature-extraction', `Xenova/${this._config.model}`) as any;
  }

  async close(): Promise<void> {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
    this._pipeline = null;
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this._pipeline) throw new EmbeddingError('Not initialized');
    const truncated = text.slice(0, 2048);
    if (!truncated.trim()) throw new EmbeddingError('Cannot embed empty text');
    const output = await this._pipeline(truncated, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  }

  async embed(fileId: number, text: string): Promise<void> {
    const embedding = await this.generateEmbedding(text);
    const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    // vec0 requires BigInt for rowid and doesn't support REPLACE — delete first
    this.db.prepare('DELETE FROM file_embeddings WHERE rowid = ?').run(BigInt(fileId));
    this.db.prepare(
      'INSERT INTO file_embeddings(rowid, embedding) VALUES (?, ?)',
    ).run(BigInt(fileId), buffer);
  }

  async embedBatch(files: Array<{ id: number; text: string }>): Promise<EmbeddingResult> {
    const start = Date.now();
    let embedded = 0;
    let skipped = 0;
    const errors: Array<{ path: string; error: string }> = [];

    const del = this.db.prepare('DELETE FROM file_embeddings WHERE rowid = ?');
    const insert = this.db.prepare(
      'INSERT INTO file_embeddings(rowid, embedding) VALUES (?, ?)',
    );

    const batchInsert = this.db.transaction((items: Array<{ id: number; embedding: Buffer }>) => {
      for (const item of items) {
        del.run(BigInt(item.id));
        insert.run(BigInt(item.id), item.embedding);
      }
    });

    const CHUNK_SIZE = 32;
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const prepared: Array<{ id: number; embedding: Buffer }> = [];

      for (const file of chunk) {
        try {
          if (!file.text || !file.text.trim()) {
            skipped++;
            continue;
          }
          const embedding = await this.generateEmbedding(file.text);
          prepared.push({
            id: file.id,
            embedding: Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength),
          });
          embedded++;
        } catch (err) {
          errors.push({
            path: `file_id:${file.id}`,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (prepared.length > 0) batchInsert(prepared);
    }

    return { embedded, skipped, errors, durationMs: Date.now() - start };
  }

  async search(
    queryText: string,
    options?: { limit?: number },
  ): Promise<Array<{ fileId: number; distance: number }>> {
    const limit = options?.limit ?? 20;
    const queryEmbedding = await this.generateEmbedding(queryText);
    const buffer = Buffer.from(queryEmbedding.buffer, queryEmbedding.byteOffset, queryEmbedding.byteLength);

    const rows = this.db.prepare(`
      SELECT rowid as file_id, distance
      FROM file_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(buffer, limit) as Array<{ file_id: number; distance: number }>;

    return rows.map((r) => ({ fileId: r.file_id, distance: r.distance }));
  }

  async remove(fileId: number): Promise<void> {
    this.db.prepare('DELETE FROM file_embeddings WHERE rowid = ?').run(BigInt(fileId));
  }

  async getEmbeddedCount(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM file_embeddings').get() as { cnt: number };
    return row.cnt;
  }

  async hasEmbedding(fileId: number): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 FROM file_embeddings WHERE rowid = ? LIMIT 1').get(BigInt(fileId));
    return row !== undefined;
  }
}
