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
  aiDescription: string | null;
  aiCategory: string | null;
  aiSubcategory: string | null;
  aiTags: string | null;
  aiDateContext: string | null;
  aiSource: string | null;
  aiContentType: string | null;
  aiConfidence: number | null;
  aiSensitive: boolean | null;
  aiSensitiveType: string | null;
  aiDetails: string | null;
  aiDescribedAt: number | null;
  aiDescriptionModel: string | null;
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
  enableAIDescriptions?: boolean;
  descriptionModel?: string;
  descriptionBatchSize?: number;
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

// ============================================================
// AI Description Types & Endpoints
// ============================================================

export interface DescribeStatus {
  undescribedCount: number;
  enableAIDescriptions: boolean;
}

export interface DescriptionResult {
  described: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
  cost: number;
  durationMs: number;
}

export interface DescribeFileResult {
  aiDescription: string;
  aiCategory: string;
  aiSubcategory: string;
  aiTags: string;
  aiDateContext: string | null;
  aiSource: string | null;
  aiContentType: string;
  aiConfidence: number;
  aiSensitive: boolean;
  aiSensitiveType: string | null;
  aiDetails: string | null;
  aiDescribedAt: number;
  aiDescriptionModel: string;
  cost: number;
}

export async function fetchDescribeStatus(): Promise<DescribeStatus> {
  return apiFetch<DescribeStatus>('/api/describe/status');
}

export async function triggerDescribeBatch(params?: { limit?: number }): Promise<DescriptionResult> {
  return apiFetch<DescriptionResult>('/api/describe/batch', {
    method: 'POST',
    body: JSON.stringify(params ?? {}),
  });
}

export async function fetchDescribeCost(): Promise<{ cost: number }> {
  return apiFetch<{ cost: number }>('/api/describe/cost');
}

export async function triggerDescribeFile(path: string): Promise<DescribeFileResult> {
  return apiFetch<DescribeFileResult>('/api/describe/file', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

// ============================================================
// Browse / Filter Types & Endpoints
// ============================================================

export interface BrowseParams {
  q?: string;
  category?: string;
  contentType?: string;
  dateContext?: string;
  source?: string;
  sensitive?: boolean;
  tags?: string;
  ext?: string;
  folder?: string;
  limit?: number;
  offset?: number;
}

export interface BrowseResult {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  aiDescription: string | null;
  aiCategory: string | null;
  aiSubcategory: string | null;
  aiTags: string | null;
  aiContentType: string | null;
  aiConfidence: number | null;
  aiSensitive: boolean;
  snippet: string | null;
  score: number | null;
}

export interface FilterOptions {
  categories: Array<{ value: string; count: number }>;
  contentTypes: Array<{ value: string; count: number }>;
  sources: Array<{ value: string; count: number }>;
  dateContexts: Array<{ value: string; count: number }>;
}

export async function fetchBrowseResults(params: BrowseParams): Promise<BrowseResult[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.category) sp.set('category', params.category);
  if (params.contentType) sp.set('contentType', params.contentType);
  if (params.dateContext) sp.set('dateContext', params.dateContext);
  if (params.source) sp.set('source', params.source);
  if (params.sensitive) sp.set('sensitive', 'true');
  if (params.tags) sp.set('tags', params.tags);
  if (params.ext) sp.set('ext', params.ext);
  if (params.folder) sp.set('folder', params.folder);
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.offset) sp.set('offset', String(params.offset));
  return apiFetch<BrowseResult[]>(`/api/files/browse?${sp.toString()}`);
}

export async function exportDescriptions(): Promise<FileRecord[]> {
  return apiFetch<FileRecord[]>('/api/files/export');
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  return apiFetch<FilterOptions>('/api/files/browse/filters');
}

// ============================================================
// Folder & File Operations
// ============================================================

export interface FolderInfo {
  path: string;
  fileCount: number;
}

export interface FileOpResult {
  success: boolean;
  transactionId: number | null;
}

export async function fetchFolders(): Promise<FolderInfo[]> {
  return apiFetch<FolderInfo[]>('/api/folders');
}

export async function moveFile(source: string, destination: string): Promise<FileOpResult> {
  return apiFetch<FileOpResult>('/api/files/move', {
    method: 'POST',
    body: JSON.stringify({ source, destination }),
  });
}

export async function copyFile(source: string, destination: string): Promise<FileOpResult> {
  return apiFetch<FileOpResult>('/api/files/copy', {
    method: 'POST',
    body: JSON.stringify({ source, destination }),
  });
}

export async function renameFile(path: string, newName: string): Promise<FileOpResult> {
  return apiFetch<FileOpResult>('/api/files/rename', {
    method: 'POST',
    body: JSON.stringify({ path, newName }),
  });
}

export async function deleteFile(path: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/files/delete', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

// ============================================================
// Smart Folder Types & Endpoints
// ============================================================

export interface SmartFolderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SmartFolderCriteria {
  q?: string;
  category?: string;
  contentType?: string;
  dateContext?: string;
  source?: string;
  sensitive?: boolean;
  tags?: string[];
  extensions?: string[];
}

export interface SmartFolderAskResponse {
  message: string;
  criteria: SmartFolderCriteria | null;
  matchCount: number;
  done: boolean;
  cost: number;
}

export async function smartFolderAsk(folderName: string, description: string, messages: SmartFolderMessage[]): Promise<SmartFolderAskResponse> {
  return apiFetch<SmartFolderAskResponse>('/api/smart-folder/ask', {
    method: 'POST',
    body: JSON.stringify({ folderName, description, messages }),
  });
}

export async function smartFolderPreview(criteria: SmartFolderCriteria): Promise<BrowseResult[]> {
  return apiFetch<BrowseResult[]>('/api/smart-folder/preview', {
    method: 'POST',
    body: JSON.stringify({ criteria }),
  });
}

export async function smartFolderCreate(folderPath: string, filePaths: string[]): Promise<ExecutionResult> {
  return apiFetch<ExecutionResult>('/api/smart-folder/create', {
    method: 'POST',
    body: JSON.stringify({ folderPath, filePaths }),
  });
}
