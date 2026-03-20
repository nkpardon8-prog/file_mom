import Database from 'better-sqlite3';
import type { TransactionRecord, TransactionStatus, BatchSummary, ActionType } from './types.js';

export interface TransactionLogConfig {
  dbPath: string;
  ttlMinutes: number;
}

export class TransactionLog {
  private _db: Database.Database | null = null;

  constructor(private _config: TransactionLogConfig) {}

  async initialize(): Promise<void> {
    this._db = new Database(this._config.dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('busy_timeout = 5000');

    this._db.exec(`
      CREATE TABLE IF NOT EXISTS batches (
        batch_id   TEXT PRIMARY KEY,
        intent     TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status     TEXT NOT NULL DEFAULT 'active',
        action_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id    TEXT NOT NULL,
        action_id   TEXT NOT NULL,
        action_type TEXT NOT NULL,
        source_path TEXT NOT NULL,
        dest_path   TEXT NOT NULL,
        executed_at INTEGER NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        expires_at  INTEGER NOT NULL,
        error       TEXT,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tx_batch ON transactions(batch_id);
      CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
    `);
  }

  async close(): Promise<void> {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  private get db(): Database.Database {
    if (!this._db) throw new Error('TransactionLog not initialized');
    return this._db;
  }

  /**
   * Create a new batch and return its ID.
   */
  createBatch(batchId: string, intent: string): void {
    this.db.prepare(
      'INSERT INTO batches (batch_id, intent, created_at) VALUES (?, ?, ?)',
    ).run(batchId, intent, Date.now());
  }

  /**
   * Record an operation BEFORE executing it. Returns the transaction ID.
   */
  record(tx: {
    batchId: string;
    actionId: string;
    actionType: ActionType;
    sourcePath: string;
    destPath: string;
  }): number {
    const ttlMs = this._config.ttlMinutes * 60 * 1000;
    const now = Date.now();

    const result = this.db.prepare(
      `INSERT INTO transactions (batch_id, action_id, action_type, source_path, dest_path, executed_at, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(tx.batchId, tx.actionId, tx.actionType, tx.sourcePath, tx.destPath, now, now + ttlMs);

    return Number(result.lastInsertRowid);
  }

  /**
   * Update the destination path (used when collision resolution changes the dest).
   */
  updateDestPath(txId: number, newDestPath: string): void {
    this.db.prepare('UPDATE transactions SET dest_path = ? WHERE id = ?').run(newDestPath, txId);
  }

  /**
   * Mark a transaction as completed.
   */
  complete(txId: number): void {
    this.db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(txId);
  }

  /**
   * Mark a transaction as failed with error message.
   */
  fail(txId: number, error: string): void {
    this.db.prepare("UPDATE transactions SET status = 'failed', error = ? WHERE id = ?").run(error, txId);
  }

  /**
   * Update batch with final action count and status.
   */
  completeBatch(batchId: string, actionCount: number): void {
    this.db.prepare(
      "UPDATE batches SET action_count = ?, status = 'completed' WHERE batch_id = ?",
    ).run(actionCount, batchId);
  }

  /**
   * Get all completed transactions for a batch, in LIFO order (for rollback).
   */
  /**
   * Get a single transaction by ID.
   */
  getTransaction(txId: number): TransactionRecord | null {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId) as {
      id: number; batch_id: string; action_id: string; action_type: string;
      source_path: string; dest_path: string; executed_at: number;
      status: string; expires_at: number; error: string | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id, batchId: row.batch_id, actionId: row.action_id,
      actionType: row.action_type as ActionType, sourcePath: row.source_path,
      destPath: row.dest_path, executedAt: row.executed_at,
      status: row.status as TransactionStatus, expiresAt: row.expires_at, error: row.error,
    };
  }

  getBatchTransactions(batchId: string): TransactionRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM transactions WHERE batch_id = ? AND status = 'completed' ORDER BY id DESC",
    ).all(batchId) as Array<{
      id: number;
      batch_id: string;
      action_id: string;
      action_type: string;
      source_path: string;
      dest_path: string;
      executed_at: number;
      status: string;
      expires_at: number;
      error: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      batchId: r.batch_id,
      actionId: r.action_id,
      actionType: r.action_type as ActionType,
      sourcePath: r.source_path,
      destPath: r.dest_path,
      executedAt: r.executed_at,
      status: r.status as TransactionStatus,
      expiresAt: r.expires_at,
      error: r.error,
    }));
  }

  /**
   * Mark all transactions in a batch as rolled back.
   */
  markRolledBack(batchId: string): void {
    this.db.prepare(
      "UPDATE transactions SET status = 'rolled_back' WHERE batch_id = ?",
    ).run(batchId);
    this.db.prepare(
      "UPDATE batches SET status = 'rolled_back' WHERE batch_id = ?",
    ).run(batchId);
  }

  /**
   * Get all batches that can be undone (completed + not expired).
   */
  getUndoable(): BatchSummary[] {
    const now = Date.now();
    const ttlMs = this._config.ttlMinutes * 60 * 1000;
    const rows = this.db.prepare(
      `SELECT b.batch_id, b.intent, b.created_at, b.status, b.action_count,
              COALESCE(MIN(t.expires_at), b.created_at + ?) as min_expires
       FROM batches b
       LEFT JOIN transactions t ON t.batch_id = b.batch_id AND t.status = 'completed'
       WHERE b.status = 'completed'
       GROUP BY b.batch_id
       HAVING min_expires > ?
       ORDER BY b.created_at DESC`,
    ).all(ttlMs, now) as Array<{
      batch_id: string;
      intent: string;
      created_at: number;
      status: string;
      action_count: number;
      min_expires: number;
    }>;

    return rows.map((r) => ({
      batchId: r.batch_id,
      intent: r.intent,
      executedAt: r.created_at,
      expiresAt: r.min_expires,
      status: 'active' as const,
      actionCount: r.action_count,
      canUndo: true,
    }));
  }

  /**
   * Clean up expired records.
   */
  cleanupExpired(): void {
    const now = Date.now();
    const ttlMs = this._config.ttlMinutes * 60 * 1000;

    // Expire batches that have expired transactions
    this.db.prepare(
      "UPDATE batches SET status = 'expired' WHERE status = 'completed' AND batch_id IN (SELECT DISTINCT batch_id FROM transactions WHERE expires_at < ?)",
    ).run(now);

    // Also expire batches with no transactions (empty/all-failed) past their TTL
    this.db.prepare(
      "UPDATE batches SET status = 'expired' WHERE status = 'completed' AND (created_at + ?) < ? AND batch_id NOT IN (SELECT DISTINCT batch_id FROM transactions WHERE status = 'completed')",
    ).run(ttlMs, now);
  }
}
