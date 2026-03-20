// ============================================================
// Types (mirrors JSON wire format from API)
// ============================================================

export interface HealthData {
  status: string;
  version: string;
}

export interface IndexStats {
  totalFiles: number;
  totalSize: number;
  byExtension: Record<string, number>;
  oldestFile: string;
  newestFile: string;
  lastScanAt: string | null;
  watchedFolders: Array<{
    path: string;
    fileCount: number;
    lastScanAt: string | null;
  }>;
}

export interface ScanResult {
  totalFiles: number;
  newFiles: number;
  updatedFiles: number;
  deletedFiles: number;
  errors: Array<{ path: string; error: string }>;
  durationMs: number;
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

// ============================================================
// Error
// ============================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================================
// Core fetch wrapper
// ============================================================

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(
      body.error ?? `Request failed with status ${res.status}`,
      res.status,
      body.code,
    );
  }

  return body.data as T;
}

// ============================================================
// Endpoint functions
// ============================================================

export async function fetchHealth(): Promise<HealthData> {
  return apiFetch<HealthData>('/api/health');
}

export async function fetchStats(): Promise<IndexStats> {
  return apiFetch<IndexStats>('/api/stats');
}

export interface ScanParams {
  folders?: string[];
  fullRescan?: boolean;
}

export async function triggerScan(params?: ScanParams): Promise<ScanResult> {
  return apiFetch<ScanResult>('/api/scan', {
    method: 'POST',
    body: JSON.stringify(params ?? {}),
  });
}

export interface SearchParams {
  q: string;
  limit?: number;
  ext?: string;
  semantic?: boolean;
}

export async function fetchSearchResults(params: SearchParams): Promise<SearchResult[]> {
  const sp = new URLSearchParams();
  sp.set('q', params.q);
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.ext) sp.set('ext', params.ext);
  if (params.semantic) sp.set('semantic', 'true');
  return apiFetch<SearchResult[]>(`/api/search?${sp.toString()}`);
}

export async function fetchFile(path: string): Promise<FileRecord> {
  return apiFetch<FileRecord>(`/api/files?path=${encodeURIComponent(path)}`);
}

export interface SettingsData {
  openRouterApiKey: string | null;
  hasApiKey: boolean;
  configPath: string;
  watchedFolders?: string[];
  model?: string;
  excludePatterns?: string[];
  includeHidden?: boolean;
  followSymlinks?: boolean;
  enableVisionEnrichment?: boolean;
  visionModel?: string;
  visionBatchSize?: number;
  enableEmbeddings?: boolean;
  embeddingModel?: string;
  embeddingDimensions?: number;
  maxFilesPerRequest?: number;
  requestTimeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  maxConcurrentOps?: number;
  undoTTLMinutes?: number;
  maxRefinementRounds?: number;
  [key: string]: unknown;
}

export async function fetchSettings(): Promise<SettingsData> {
  return apiFetch<SettingsData>('/api/settings');
}

export async function updateSettings(updates: Partial<SettingsData>): Promise<{ saved: boolean; configPath: string; updatedFields: string[] }> {
  return apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(updates) });
}

export async function addWatchedFolder(path: string): Promise<{ added: string; watchedFolders: string[] }> {
  return apiFetch('/api/settings/folders', { method: 'POST', body: JSON.stringify({ path }) });
}

export async function removeWatchedFolder(path: string): Promise<{ removed: string; watchedFolders: string[] }> {
  return apiFetch('/api/settings/folders', { method: 'DELETE', body: JSON.stringify({ path }) });
}

export async function testApiKey(apiKey?: string): Promise<{ valid: boolean; error?: string }> {
  return apiFetch('/api/settings/test-key', { method: 'POST', body: JSON.stringify({ apiKey }) });
}

// ============================================================
// Plan & Execute Types
// ============================================================

export type ActionType = 'move_file' | 'rename_file' | 'create_folder' | 'copy_file';

export interface Action {
  id: string;
  type: ActionType;
  source: string;
  destination: string;
  reason: string;
  confidence: number;
}

export interface ActionPlan {
  intent: string;
  actions: Action[];
  needsReview: string[];
  summary: { filesAffected: number; foldersCreated: number; totalSizeBytes: number };
  warnings: string[];
}

export interface QueryExpansion {
  keywords: string[];
  folderPatterns: string[];
  extensions: string[];
  reasoning: string;
}

export interface PlanResponse {
  plan: ActionPlan;
  expansion: QueryExpansion | null;
  cost: number;
}

export interface RefineResponse {
  plan: ActionPlan;
  cost: number;
}

export interface ActionResult {
  actionId: string;
  success: boolean;
  error: string | null;
  transactionId: number | null;
}

export interface ExecutionResult {
  batchId: string;
  success: boolean;
  results: ActionResult[];
  summary: { succeeded: number; failed: number; skipped: number };
}

export interface BatchSummary {
  batchId: string;
  intent: string;
  executedAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'rolled_back';
  actionCount: number;
  canUndo: boolean;
}

export interface UndoResult {
  success: boolean;
  restored: number;
  errors: string[];
}

// ============================================================
// Plan & Execute Endpoints
// ============================================================

export interface GeneratePlanParams {
  command: string;
  previewOnly?: boolean;
}

export async function generatePlan(params: GeneratePlanParams): Promise<PlanResponse> {
  return apiFetch<PlanResponse>('/api/plan', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface RefinePlanParams {
  plan: ActionPlan;
  feedback: string;
  history: string[];
}

export async function refinePlan(params: RefinePlanParams): Promise<RefineResponse> {
  return apiFetch<RefineResponse>('/api/plan/refine', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface ExecutePlanParams {
  plan: ActionPlan;
  dryRun?: boolean;
}

export async function executePlan(params: ExecutePlanParams): Promise<ExecutionResult> {
  return apiFetch<ExecutionResult>('/api/execute', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchUndoBatches(): Promise<BatchSummary[]> {
  return apiFetch<BatchSummary[]>('/api/undo/batches');
}

export async function undoBatch(batchId: string): Promise<UndoResult> {
  return apiFetch<UndoResult>('/api/undo', {
    method: 'POST',
    body: JSON.stringify({ batchId }),
  });
}

// ============================================================
// Enrich & Embed Types
// ============================================================

export interface EnrichmentResult {
  enriched: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
  cost: number;
  durationMs: number;
}

export interface VisionResultWithCost {
  description: string;
  category: string;
  tags: string[];
  confidence: number;
  model: string;
  enrichedAt: number;
  cost: number;
}

export interface EmbeddingResult {
  embedded: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
  durationMs: number;
}

export interface EnrichStatus {
  unenrichedCount: number;
  unembeddedCount: number;
  enableVisionEnrichment: boolean;
  enableEmbeddings: boolean;
}

// ============================================================
// Enrich & Embed Endpoints
// ============================================================

export async function fetchEnrichStatus(): Promise<EnrichStatus> {
  return apiFetch<EnrichStatus>('/api/enrich/status');
}

export async function triggerEnrichBatch(params?: { limit?: number }): Promise<EnrichmentResult> {
  return apiFetch<EnrichmentResult>('/api/enrich/batch', {
    method: 'POST',
    body: JSON.stringify(params ?? {}),
  });
}

export async function triggerEnrichFile(path: string): Promise<VisionResultWithCost> {
  return apiFetch<VisionResultWithCost>('/api/enrich/file', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function triggerEmbed(params?: { limit?: number }): Promise<EmbeddingResult> {
  return apiFetch<EmbeddingResult>('/api/embed', {
    method: 'POST',
    body: JSON.stringify(params ?? {}),
  });
}

// ============================================================
// Watcher
// ============================================================

export interface WatcherStatus {
  watching: boolean;
  clients: number;
}

export interface WatcherEvent {
  type: 'file:created' | 'file:modified' | 'file:deleted' | 'file:renamed' | 'error';
  path?: string;
  oldPath?: string;
  newPath?: string;
  error?: string;
}

export async function watcherStart(): Promise<{ watching: boolean }> {
  return apiFetch('/api/watch/start', { method: 'POST' });
}

export async function watcherStop(): Promise<{ watching: boolean }> {
  return apiFetch('/api/watch/stop', { method: 'POST' });
}

export async function fetchWatcherStatus(): Promise<WatcherStatus> {
  return apiFetch<WatcherStatus>('/api/watch/status');
}
