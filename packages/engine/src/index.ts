// Main orchestrator
export { FileMom } from './filemom.js';

// Components
export { Scanner } from './scanner.js';
export { Extractor } from './extractor.js';
export { Indexer } from './indexer.js';
export { VisionEnricher } from './vision.js';
export { Describer, DescriptionResponseSchema } from './describer.js';
export { Watcher } from './watcher.js';
export {
  AIInterface,
  ActionSchema,
  ActionPlanSchema,
  ACTION_PLAN_JSON_SCHEMA,
  QueryExpansionSchema,
  SYSTEM_PROMPT,
  REFINEMENT_SYSTEM_PROMPT,
  buildUserPrompt,
  buildRefinementPrompt,
} from './ai.js';
export { Executor } from './executor.js';
export { TransactionLog } from './transaction.js';
export { Embeddings } from './embeddings.js';

// Config
export { ConfigSchema, DEFAULT_CONFIG } from './config.js';

// Errors
export {
  FileMomError,
  ScanError,
  ExtractionError,
  AIError,
  ExecutionError,
  ValidationError,
  WatcherError,
  EmbeddingError,
} from './errors.js';

// Utilities
export { quickHash } from './utils/hash.js';
export { normalizePath, isWithinFolder } from './utils/path.js';
export { safeCopy, verifyIdentical, pathExists, resolveCollision } from './utils/fs.js';

// Types (re-export all)
export type * from './types.js';

// Component config types
export type { ScannerConfig } from './scanner.js';
export type { ExtractorConfig } from './extractor.js';
export type { IndexerConfig } from './indexer.js';
export type { WatcherConfig } from './watcher.js';
export type { AIInterfaceConfig, QueryExpansion } from './ai.js';
export type { ExecutorConfig } from './executor.js';
export type { TransactionLogConfig } from './transaction.js';
export type { VisionEnricherConfig } from './vision.js';
export type { DescriberConfig, DescriptionFields } from './describer.js';
export type { EmbeddingsConfig } from './embeddings.js';
