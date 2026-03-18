import type { ActionPlan, ExecutionResult } from './types.js';

export interface ExecutorConfig {
  maxConcurrent: number;
  retryAttempts: number;
  retryDelayMs: number;
}

// TODO: Implement in Phase 6
export class Executor {
  constructor(private _config: ExecutorConfig) {}

  async execute(_plan: ActionPlan): Promise<ExecutionResult> {
    // Phase 6: validate plan, topological sort, copy-then-delete, parallel with p-limit
    throw new Error('Not implemented');
  }
}
