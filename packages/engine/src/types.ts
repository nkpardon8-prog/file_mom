// ============================================================
// Core File Types
// ============================================================

/** Output from Scanner — basic file info from filesystem */
export interface ScannedFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  ctime: number;
  isSymlink: boolean;
  isDirectory: boolean;
}

/** Output from Extractor — adds content-based metadata */
export interface ExtractedMetadata {
  path: string;
  quickHash: string;
  extractedText: string | null;
  exif: ExifData | null;
  detectedMimeType: string | null;
  extractionError: string | null;
  extractedAt: number;
}

/** EXIF data extracted from images */
export interface ExifData {
  dateTaken: string | null;
  camera: string | null;
  lens: string | null;
  dimensions: {
    width: number;
    height: number;
  } | null;
  gps: {
    latitude: number;
    longitude: number;
    altitude: number | null;
  } | null;
  orientation: number | null;
}

/** Output from VisionEnricher — visual understanding of file */
export interface VisionResult {
  description: string;
  category: string;
  tags: string[];
  confidence: number;
  model: string;
  enrichedAt: number;
}

/** Result of a batch enrichment operation */
export interface EnrichmentResult {
  enriched: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
  cost: number;
  durationMs: number;
}

/** Combined file record stored in database */
export interface FileRecord {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  ctime: number;
  quickHash: string;
  extractedText: string | null;
  exifJson: string | null;
  detectedMimeType: string | null;
  indexedAt: number;
  embeddingId: string | null;
  visionDescription: string | null;
  visionCategory: string | null;
  visionTags: string | null;
  enrichedAt: number | null;
}

/** Simplified file info sent to Claude API */
export interface FileIndexEntry {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedDate: string;
  summary: string | null;
  visionDescription: string | null;
}

// ============================================================
// Action Plan Types
// ============================================================

export type ActionType = 'move_file' | 'rename_file' | 'create_folder' | 'copy_file';

/** Single action in an action plan */
export interface Action {
  id: string;
  type: ActionType;
  source: string;
  destination: string;
  reason: string;
  confidence: number;
}

/** Complete action plan returned by AI */
export interface ActionPlan {
  intent: string;
  actions: Action[];
  needsReview: string[];
  summary: {
    filesAffected: number;
    foldersCreated: number;
    totalSizeBytes: number;
  };
  warnings: string[];
}

/** Result of executing a single action */
export interface ActionResult {
  actionId: string;
  success: boolean;
  error: string | null;
  transactionId: number | null;
}

/** Result of executing an entire plan */
export interface ExecutionResult {
  batchId: string;
  success: boolean;
  results: ActionResult[];
  summary: {
    succeeded: number;
    failed: number;
    skipped: number;
  };
}

// ============================================================
// Transaction Types
// ============================================================

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'rolled_back';

/** Single transaction record for undo */
export interface TransactionRecord {
  id: number;
  batchId: string;
  actionId: string;
  actionType: ActionType;
  sourcePath: string;
  destPath: string;
  executedAt: number;
  status: TransactionStatus;
  expiresAt: number;
  error: string | null;
}

/** Summary of a batch for undo UI */
export interface BatchSummary {
  batchId: string;
  intent: string;
  executedAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'rolled_back';
  actionCount: number;
  canUndo: boolean;
}

// ============================================================
// Configuration Types
// ============================================================

/** Model identifier — any OpenRouter model ID (e.g. 'anthropic/claude-sonnet-4') */
export type AIModel = string;

/** Full engine configuration */
export interface FileMomConfig {
  dataDir: string;
  watchedFolders: string[];
  excludePatterns: string[];
  includeHidden: boolean;
  followSymlinks: boolean;
  maxTextLength: number;
  extractionTimeoutMs: number;
  skipExtensions: string[];
  openRouterApiKey: string;
  model: AIModel;
  maxFilesPerRequest: number;
  requestTimeoutMs: number;
  undoTTLMinutes: number;
  maxConcurrentOps: number;
  retryAttempts: number;
  retryDelayMs: number;
  maxRefinementRounds: number;
  enableVisionEnrichment: boolean;
  visionModel: string;
  visionMaxImageDimension: number;
  visionBatchSize: number;
  visionMinTextThreshold: number;
  enableEmbeddings: boolean;
  embeddingModel: string;
  embeddingDimensions: number;
}

/** Options for refining an existing action plan */
export interface RefinePlanOptions {
  plan: ActionPlan;
  feedback: string;
  history: string[];
}

// ============================================================
// Event Types
// ============================================================

export type WatcherEvent =
  | { type: 'file:created'; path: string }
  | { type: 'file:modified'; path: string }
  | { type: 'file:deleted'; path: string }
  | { type: 'file:renamed'; oldPath: string; newPath: string }
  | { type: 'error'; error: Error; path?: string };

export type ScannerEvent =
  | { type: 'scan:started'; folders: string[] }
  | { type: 'scan:progress'; scanned: number; total: number | null }
  | { type: 'scan:file'; file: ScannedFile }
  | { type: 'scan:error'; path: string; error: Error }
  | { type: 'scan:completed'; totalFiles: number; durationMs: number };

export type ExecutorEvent =
  | { type: 'execute:started'; batchId: string; actionCount: number }
  | { type: 'execute:action'; actionId: string; action: Action }
  | { type: 'execute:success'; actionId: string }
  | { type: 'execute:failed'; actionId: string; error: Error }
  | { type: 'execute:completed'; result: ExecutionResult };

// ============================================================
// API Method Types
// ============================================================

export interface ScanOptions {
  folders?: string[];
  fullRescan?: boolean;
  onProgress?: (event: ScannerEvent) => void;
}

export interface ScanResult {
  totalFiles: number;
  newFiles: number;
  updatedFiles: number;
  deletedFiles: number;
  errors: Array<{ path: string; error: string }>;
  durationMs: number;
}

export interface SearchOptions {
  limit?: number;
  extensions?: string[];
  folders?: string[];
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: Date;
  modifiedBefore?: Date;
}

export interface SearchResult {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  score: number;
  snippet: string | null;
}

export interface SemanticSearchOptions {
  limit?: number;
  extensions?: string[];
  folders?: string[];
  ftsWeight?: number;
  vectorWeight?: number;
  minScore?: number;
}

export interface HybridSearchResult {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  ftsScore: number;
  vectorScore: number;
  combinedScore: number;
  snippet: string | null;
}

export interface EmbeddingResult {
  embedded: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
  durationMs: number;
}

export interface PlanOptions {
  previewOnly?: boolean;
  maxFiles?: number;
  context?: {
    recentFolders?: string[];
    previousCommands?: string[];
  };
}

export interface ExecuteOptions {
  dryRun?: boolean;
  stopOnError?: boolean;
  onProgress?: (event: ExecutorEvent) => void;
}

export interface IndexStats {
  totalFiles: number;
  totalSize: number;
  byExtension: Record<string, number>;
  oldestFile: Date;
  newestFile: Date;
  lastScanAt: Date | null;
  watchedFolders: Array<{
    path: string;
    fileCount: number;
    lastScanAt: Date | null;
  }>;
}

export interface WatchedFolder {
  path: string;
  fileCount: number;
  lastScanAt: Date | null;
  enabled: boolean;
}
