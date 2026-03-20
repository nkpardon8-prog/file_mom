import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TransactionLog } from '../src/transaction.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let txLog: TransactionLog;
let tempDir: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'filemom-tx-'));
  txLog = new TransactionLog({
    dbPath: join(tempDir, 'tx-test.db'),
    ttlMinutes: 30,
  });
  await txLog.initialize();
});

afterEach(async () => {
  await txLog.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('TransactionLog', () => {
  // ============================================================
  // Lifecycle
  // ============================================================

  it('initializes and creates tables', () => {
    const batches = txLog.getUndoable();
    expect(batches).toEqual([]);
  });

  it('throws when used before initialize', () => {
    const uninit = new TransactionLog({
      dbPath: join(tempDir, 'uninit.db'),
      ttlMinutes: 30,
    });
    expect(() => uninit.getUndoable()).toThrow('not initialized');
  });

  it('persists data across close and reopen', async () => {
    txLog.createBatch('batch-1', 'Organize photos');
    const txId = txLog.record({
      batchId: 'batch-1',
      actionId: 'act-1',
      actionType: 'move_file',
      sourcePath: '/a.txt',
      destPath: '/b.txt',
    });
    txLog.complete(txId);
    txLog.completeBatch('batch-1', 1);

    const dbPath = join(tempDir, 'tx-test.db');
    await txLog.close();

    txLog = new TransactionLog({ dbPath, ttlMinutes: 30 });
    await txLog.initialize();

    const transactions = txLog.getBatchTransactions('batch-1');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].sourcePath).toBe('/a.txt');
  });

  // ============================================================
  // createBatch + record
  // ============================================================

  it('creates a batch and records a transaction', () => {
    txLog.createBatch('batch-1', 'Sort documents');
    const txId = txLog.record({
      batchId: 'batch-1',
      actionId: 'act-1',
      actionType: 'move_file',
      sourcePath: '/src/doc.pdf',
      destPath: '/dest/doc.pdf',
    });
    expect(txId).toBeGreaterThan(0);
  });

  it('record sets status to pending initially', () => {
    txLog.createBatch('batch-1', 'Test');
    txLog.record({
      batchId: 'batch-1',
      actionId: 'act-1',
      actionType: 'move_file',
      sourcePath: '/a.txt',
      destPath: '/b.txt',
    });

    // getBatchTransactions only returns completed, so pending won't show
    const transactions = txLog.getBatchTransactions('batch-1');
    expect(transactions).toHaveLength(0);
  });

  // ============================================================
  // complete + fail
  // ============================================================

  it('complete marks transaction as completed', () => {
    txLog.createBatch('batch-1', 'Test');
    const txId = txLog.record({
      batchId: 'batch-1',
      actionId: 'act-1',
      actionType: 'move_file',
      sourcePath: '/a.txt',
      destPath: '/b.txt',
    });
    txLog.complete(txId);

    const transactions = txLog.getBatchTransactions('batch-1');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].status).toBe('completed');
    expect(transactions[0].actionType).toBe('move_file');
    expect(transactions[0].sourcePath).toBe('/a.txt');
    expect(transactions[0].destPath).toBe('/b.txt');
  });

  it('fail marks transaction with error and excludes from getBatchTransactions', () => {
    txLog.createBatch('batch-1', 'Test');
    const txId = txLog.record({
      batchId: 'batch-1',
      actionId: 'act-1',
      actionType: 'copy_file',
      sourcePath: '/a.txt',
      destPath: '/b.txt',
    });
    txLog.fail(txId, 'Permission denied');

    const transactions = txLog.getBatchTransactions('batch-1');
    expect(transactions).toHaveLength(0);
  });

  // ============================================================
  // updateDestPath
  // ============================================================

  it('updateDestPath changes the destination', () => {
    txLog.createBatch('batch-1', 'Test');
    const txId = txLog.record({
      batchId: 'batch-1',
      actionId: 'act-1',
      actionType: 'move_file',
      sourcePath: '/a.txt',
      destPath: '/b.txt',
    });
    txLog.updateDestPath(txId, '/b (1).txt');
    txLog.complete(txId);

    const transactions = txLog.getBatchTransactions('batch-1');
    expect(transactions[0].destPath).toBe('/b (1).txt');
  });

  // ============================================================
  // getBatchTransactions — LIFO order
  // ============================================================

  it('getBatchTransactions returns completed in LIFO order', () => {
    txLog.createBatch('batch-1', 'Multi-action');
    const tx1 = txLog.record({ batchId: 'batch-1', actionId: 'act-1', actionType: 'create_folder', sourcePath: '', destPath: '/new-folder' });
    const tx2 = txLog.record({ batchId: 'batch-1', actionId: 'act-2', actionType: 'move_file', sourcePath: '/a.txt', destPath: '/new-folder/a.txt' });
    const tx3 = txLog.record({ batchId: 'batch-1', actionId: 'act-3', actionType: 'move_file', sourcePath: '/b.txt', destPath: '/new-folder/b.txt' });

    txLog.complete(tx1);
    txLog.complete(tx2);
    txLog.complete(tx3);

    const transactions = txLog.getBatchTransactions('batch-1');
    expect(transactions).toHaveLength(3);
    expect(transactions[0].actionId).toBe('act-3');
    expect(transactions[1].actionId).toBe('act-2');
    expect(transactions[2].actionId).toBe('act-1');
  });

  it('getBatchTransactions excludes failed and pending', () => {
    txLog.createBatch('batch-1', 'Mixed');
    const tx1 = txLog.record({ batchId: 'batch-1', actionId: 'ok', actionType: 'move_file', sourcePath: '/a', destPath: '/b' });
    const tx2 = txLog.record({ batchId: 'batch-1', actionId: 'fail', actionType: 'move_file', sourcePath: '/c', destPath: '/d' });
    txLog.record({ batchId: 'batch-1', actionId: 'pending', actionType: 'move_file', sourcePath: '/e', destPath: '/f' });

    txLog.complete(tx1);
    txLog.fail(tx2, 'oops');

    const transactions = txLog.getBatchTransactions('batch-1');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].actionId).toBe('ok');
  });

  // ============================================================
  // getUndoable + completeBatch
  // ============================================================

  it('getUndoable returns active non-expired batches', () => {
    txLog.createBatch('batch-1', 'Sort files');
    const txId = txLog.record({ batchId: 'batch-1', actionId: 'act-1', actionType: 'move_file', sourcePath: '/a.txt', destPath: '/b.txt' });
    txLog.complete(txId);
    txLog.completeBatch('batch-1', 1);

    const undoable = txLog.getUndoable();
    expect(undoable).toHaveLength(1);
    expect(undoable[0].batchId).toBe('batch-1');
    expect(undoable[0].intent).toBe('Sort files');
    expect(undoable[0].actionCount).toBe(1);
    expect(undoable[0].canUndo).toBe(true);
    expect(undoable[0].status).toBe('active');
  });

  it('getUndoable excludes expired batches', async () => {
    await txLog.close();
    txLog = new TransactionLog({ dbPath: join(tempDir, 'tx-test.db'), ttlMinutes: 0 });
    await txLog.initialize();

    txLog.createBatch('batch-expired', 'Old');
    const txId = txLog.record({ batchId: 'batch-expired', actionId: 'act-1', actionType: 'move_file', sourcePath: '/a.txt', destPath: '/b.txt' });
    txLog.complete(txId);
    txLog.completeBatch('batch-expired', 1);

    const undoable = txLog.getUndoable();
    expect(undoable).toHaveLength(0);
  });

  // ============================================================
  // markRolledBack
  // ============================================================

  it('markRolledBack makes batch non-undoable', () => {
    txLog.createBatch('batch-1', 'Sort');
    const txId = txLog.record({ batchId: 'batch-1', actionId: 'act-1', actionType: 'move_file', sourcePath: '/a.txt', destPath: '/b.txt' });
    txLog.complete(txId);
    txLog.completeBatch('batch-1', 1);

    txLog.markRolledBack('batch-1');

    expect(txLog.getUndoable()).toHaveLength(0);
    expect(txLog.getBatchTransactions('batch-1')).toHaveLength(0);
  });

  // ============================================================
  // cleanupExpired
  // ============================================================

  it('cleanupExpired marks expired batches', async () => {
    await txLog.close();
    txLog = new TransactionLog({ dbPath: join(tempDir, 'tx-test.db'), ttlMinutes: 0 });
    await txLog.initialize();

    txLog.createBatch('batch-exp', 'Expired');
    const txId = txLog.record({ batchId: 'batch-exp', actionId: 'act-1', actionType: 'move_file', sourcePath: '/a.txt', destPath: '/b.txt' });
    txLog.complete(txId);
    txLog.completeBatch('batch-exp', 1);

    txLog.cleanupExpired();

    expect(txLog.getUndoable()).toHaveLength(0);
  });

  // ============================================================
  // TTL computation
  // ============================================================

  it('record computes correct expires_at based on ttlMinutes', () => {
    txLog.createBatch('batch-1', 'TTL test');
    const before = Date.now();
    const txId = txLog.record({ batchId: 'batch-1', actionId: 'act-1', actionType: 'move_file', sourcePath: '/a.txt', destPath: '/b.txt' });
    const after = Date.now();
    txLog.complete(txId);

    const transactions = txLog.getBatchTransactions('batch-1');
    const ttlMs = 30 * 60 * 1000;
    expect(transactions[0].expiresAt).toBeGreaterThanOrEqual(before + ttlMs);
    expect(transactions[0].expiresAt).toBeLessThanOrEqual(after + ttlMs);
  });
});
