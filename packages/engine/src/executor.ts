import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import pLimit from 'p-limit';
import { safeCopy, pathExists, resolveCollision } from './utils/fs.js';
import { ExecutionError } from './errors.js';
import type { TransactionLog } from './transaction.js';
import type {
  Action,
  ActionPlan,
  ActionResult,
  ExecutionResult,
  ExecutorEvent,
} from './types.js';

export interface ExecutorConfig {
  maxConcurrent: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export class Executor {
  constructor(
    private _config: ExecutorConfig,
    private _txLog: TransactionLog,
  ) {}

  async execute(
    plan: ActionPlan,
    options?: {
      dryRun?: boolean;
      stopOnError?: boolean;
      onProgress?: (event: ExecutorEvent) => void;
    },
  ): Promise<ExecutionResult> {
    const batchId = randomUUID();
    const results: ActionResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    // 1. Create batch in transaction log
    this._txLog.createBatch(batchId, plan.intent);

    options?.onProgress?.({
      type: 'execute:started',
      batchId,
      actionCount: plan.actions.length,
    });

    // 2. Sort actions: create_folder first (by path depth), then others
    const sorted = this._topologicalSort(plan.actions);

    // 3. Split into folder creations (sequential) and file ops (parallel)
    const folderActions = sorted.filter((a) => a.type === 'create_folder');
    const fileActions = sorted.filter((a) => a.type !== 'create_folder');

    // 4. Execute folder creations sequentially (must be in order)
    for (const action of folderActions) {
      const result = await this._executeAction(action, batchId, options);
      results.push(result);
      if (result.success) succeeded++;
      else if (result.error) failed++;
      else skipped++;

      options?.onProgress?.({
        type: result.success ? 'execute:success' : 'execute:failed',
        actionId: action.id,
        ...(result.success ? {} : { error: new Error(result.error ?? 'Unknown') }),
      } as ExecutorEvent);

      if (!result.success && options?.stopOnError) break;
    }

    // 5. Execute file operations in parallel
    if (!options?.stopOnError || failed === 0) {
      const limit = pLimit(this._config.maxConcurrent);
      const fileResults = await Promise.all(
        fileActions.map((action) =>
          limit(async () => {
            const result = await this._executeAction(action, batchId, options);

            options?.onProgress?.({
              type: result.success ? 'execute:success' : 'execute:failed',
              actionId: action.id,
              ...(result.success ? {} : { error: new Error(result.error ?? 'Unknown') }),
            } as ExecutorEvent);

            return result;
          }),
        ),
      );

      for (const result of fileResults) {
        results.push(result);
        if (result.success) succeeded++;
        else if (result.error) failed++;
        else skipped++;
      }
    }

    // 6. Finalize batch
    this._txLog.completeBatch(batchId, succeeded);

    const executionResult: ExecutionResult = {
      batchId,
      success: failed === 0,
      results,
      summary: { succeeded, failed, skipped },
    };

    options?.onProgress?.({
      type: 'execute:completed',
      result: executionResult,
    });

    return executionResult;
  }

  /**
   * Sort actions: create_folder first (by path depth ascending), then file ops.
   */
  private _topologicalSort(actions: Action[]): Action[] {
    const folders = actions
      .filter((a) => a.type === 'create_folder')
      .sort((a, b) => {
        // Shorter paths first (parent folders before children)
        const depthA = a.destination.split('/').length;
        const depthB = b.destination.split('/').length;
        return depthA - depthB;
      });

    const files = actions.filter((a) => a.type !== 'create_folder');

    return [...folders, ...files];
  }

  /**
   * Execute a single action with transaction logging.
   */
  private async _executeAction(
    action: Action,
    batchId: string,
    options?: { dryRun?: boolean },
  ): Promise<ActionResult> {
    // Dry run: just validate, don't execute
    if (options?.dryRun) {
      const validation = await this._validateAction(action);
      return {
        actionId: action.id,
        success: validation === null,
        error: validation,
        transactionId: null,
      };
    }

    // Record in transaction log BEFORE executing
    const txId = this._txLog.record({
      batchId,
      actionId: action.id,
      actionType: action.type,
      sourcePath: action.source,
      destPath: action.destination,
    });

    try {
      // Guard: source == destination is a no-op (prevents data loss from copy-then-delete)
      if (action.source === action.destination && action.type !== 'create_folder') {
        this._txLog.complete(txId);
        return { actionId: action.id, success: true, error: null, transactionId: txId };
      }

      // Resolve destination collision (not for folders — mkdir is idempotent)
      let finalDest = action.destination;
      if (action.type !== 'create_folder') {
        finalDest = await resolveCollision(action.destination);
      }

      // If collision resolved to a different path, update the transaction record
      if (finalDest !== action.destination) {
        // Update dest_path in the existing transaction record
        this._txLog.updateDestPath(txId, finalDest);
      }

      await this._performAction(action.type, action.source, finalDest);
      this._txLog.complete(txId);

      return { actionId: action.id, success: true, error: null, transactionId: txId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._txLog.fail(txId, message);
      return { actionId: action.id, success: false, error: message, transactionId: txId };
    }
  }

  /**
   * Perform the actual file system operation.
   */
  private async _performAction(
    type: string,
    source: string,
    destination: string,
  ): Promise<void> {
    // Guard: source == destination is a no-op (prevents copy-then-delete data loss)
    if (source === destination && type !== 'create_folder') {
      return;
    }

    switch (type) {
      case 'create_folder':
        await mkdir(destination, { recursive: true });
        break;

      case 'move_file': {
        // Copy-then-delete: safe, works across volumes
        await safeCopy(source, destination);
        await rm(source);
        break;
      }

      case 'copy_file':
        await safeCopy(source, destination);
        break;

      case 'rename_file': {
        // Rename is just a move within the same directory
        await safeCopy(source, destination);
        await rm(source);
        break;
      }

      default:
        throw new ExecutionError('unknown', `Unknown action type: ${type}`);
    }
  }

  /**
   * Validate a single action without executing it.
   * Returns null if valid, or an error message string.
   */
  private async _validateAction(action: Action): Promise<string | null> {
    switch (action.type) {
      case 'create_folder':
        // Folder creation is always valid (mkdir recursive)
        return null;

      case 'move_file':
      case 'copy_file':
      case 'rename_file': {
        if (!(await pathExists(action.source))) {
          return `Source does not exist: ${action.source}`;
        }
        // Check source is a file, not a directory
        const srcStat = await stat(action.source);
        if (srcStat.isDirectory()) {
          return `Source is a directory, not a file: ${action.source}`;
        }
        // Check destination parent directory exists or can be created
        const destDir = dirname(action.destination);
        if (!(await pathExists(destDir))) {
          // Parent doesn't exist yet — that's OK if a create_folder action creates it
          // For validation purposes, we allow this
        }
        return null;
      }

      default:
        return `Unknown action type: ${action.type}`;
    }
  }
}
