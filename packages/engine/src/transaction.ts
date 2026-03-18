import type { TransactionRecord, BatchSummary } from './types.js';

export interface TransactionLogConfig {
  dbPath: string;
  ttlMinutes: number;
}

// TODO: Implement in Phase 6
export class TransactionLog {
  constructor(private _config: TransactionLogConfig) {}

  async initialize(): Promise<void> {
    // Phase 6: create transactions table
  }

  async record(_tx: Omit<TransactionRecord, 'id'>): Promise<number> {
    // Phase 6: log operation before executing
    throw new Error('Not implemented');
  }

  async complete(_txId: number): Promise<void> {
    // Phase 6: mark as completed
  }

  async fail(_txId: number, _error: string): Promise<void> {
    // Phase 6: mark as failed
  }

  async rollback(_batchId: string): Promise<void> {
    // Phase 6: reverse a batch in LIFO order
  }

  async getUndoable(): Promise<BatchSummary[]> {
    // Phase 6: get batches within TTL
    return [];
  }

  async cleanupExpired(): Promise<void> {
    // Phase 6: delete records past TTL
  }
}
