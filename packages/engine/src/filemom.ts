import { randomUUID } from 'node:crypto';
import { join, basename, extname, dirname } from 'node:path';
import { mkdir, rm, rmdir, stat } from 'node:fs/promises';
import { Scanner } from './scanner.js';
import { Extractor } from './extractor.js';
import { Indexer } from './indexer.js';
import { AIInterface, type QueryExpansion } from './ai.js';
import { VisionEnricher } from './vision.js';
import { Executor } from './executor.js';
import { TransactionLog } from './transaction.js';
import { Watcher } from './watcher.js';
import { Embeddings } from './embeddings.js';
import { Describer, type DescriptionFields } from './describer.js';
import { safeCopy, pathExists } from './utils/fs.js';
import { AIError, EmbeddingError } from './errors.js';
import { ConfigSchema } from './config.js';
import type {
  FileMomConfig,
  ScannedFile,
  ExtractedMetadata,
  FileRecord,
  FileIndexEntry,
  VisionResult,
  ActionPlan,
  ExecutionResult,
  BatchSummary,
  EnrichmentResult,
  ScanOptions,
  ScanResult,
  SearchOptions,
  SearchResult,
  BrowseOptions,
  BrowseResult,
  FilterOptions,
  FolderInfo,
  SmartFolderMessage,
  SmartFolderResponse,
  SmartFolderCriteria,
  Action,
  PlanOptions,
  RefinePlanOptions,
  ExecuteOptions,
  IndexStats,
  WatcherEvent,
  SemanticSearchOptions,
  HybridSearchResult,
  EmbeddingResult,
  DescriptionResult,
} from './types.js';

export class FileMom {
  private _scanner: Scanner;
  private _extractor: Extractor;
  private _indexer: Indexer;
  private _ai: AIInterface;
  private _vision: VisionEnricher | null;
  private _executor: Executor;
  private _txLog: TransactionLog;
  private _watcher: Watcher | null = null;
  private _embeddings: Embeddings | null = null;
  private _describer: Describer | null = null;
  private _lastExpansion: QueryExpansion | null = null;
  private _config: FileMomConfig;

  constructor(config: FileMomConfig) {
    this._config = ConfigSchema.parse(config);

    this._scanner = new Scanner({
      excludePatterns: this._config.excludePatterns,
      includeHidden: this._config.includeHidden,
      followSymlinks: this._config.followSymlinks,
    });

    this._extractor = new Extractor({
      maxTextLength: this._config.maxTextLength,
      timeoutMs: this._config.extractionTimeoutMs,
      skipExtensions: this._config.skipExtensions,
    });

    this._indexer = new Indexer({
      dbPath: join(this._config.dataDir, 'index.db'),
    });

    this._ai = new AIInterface({
      apiKey: this._config.openRouterApiKey,
      model: this._config.model,
      maxFilesPerRequest: this._config.maxFilesPerRequest,
      requestTimeoutMs: this._config.requestTimeoutMs,
      retryAttempts: this._config.retryAttempts,
      retryDelayMs: this._config.retryDelayMs,
      maxRefinementRounds: this._config.maxRefinementRounds,
    });

    this._vision = this._config.enableVisionEnrichment
      ? new VisionEnricher({
          apiKey: this._config.openRouterApiKey,
          model: this._config.visionModel,
          maxImageDimension: this._config.visionMaxImageDimension,
          batchSize: this._config.visionBatchSize,
          concurrency: 5,
          retryAttempts: this._config.retryAttempts,
          retryDelayMs: this._config.retryDelayMs,
        })
      : null;

    this._describer = this._config.enableAIDescriptions
      ? new Describer({
          apiKey: this._config.openRouterApiKey,
          visionModel: this._config.visionModel,
          textModel: this._config.descriptionModel,
          concurrency: this._config.descriptionMaxConcurrent,
          retryAttempts: this._config.retryAttempts,
          retryDelayMs: this._config.retryDelayMs,
          maxImageDimension: this._config.visionMaxImageDimension,
        })
      : null;

    this._txLog = new TransactionLog({
      dbPath: join(this._config.dataDir, 'index.db'),
      ttlMinutes: this._config.undoTTLMinutes,
    });

    this._executor = new Executor(
      {
        maxConcurrent: this._config.maxConcurrentOps,
        retryAttempts: this._config.retryAttempts,
        retryDelayMs: this._config.retryDelayMs,
      },
      this._txLog,
    );
  }

  async initialize(): Promise<void> {
    await mkdir(this._config.dataDir, { recursive: true });
    await this._indexer.initialize();
    await this._txLog.initialize();

    if (this._config.enableEmbeddings) {
      this._embeddings = new Embeddings({
        model: this._config.embeddingModel,
        dimensions: this._config.embeddingDimensions,
        dbPath: join(this._config.dataDir, 'index.db'),
      });
      await this._embeddings.initialize();
    }
  }

  async shutdown(): Promise<void> {
    await this.stopWatching();
    if (this._embeddings) {
      await this._embeddings.close();
      this._embeddings = null;
    }
    await this._indexer.close();
    await this._txLog.close();
  }

  // ============================================================
  // Phase 1-2: Scan → Extract → Index
  // ============================================================

  async scan(options?: ScanOptions): Promise<ScanResult> {
    const start = Date.now();
    const folders = options?.folders ?? this._config.watchedFolders;
    const errors: Array<{ path: string; error: string }> = [];

    let newFiles = 0;
    let updatedFiles = 0;
    let deletedFiles = 0;
    let totalFiles = 0;

    const batch: FileRecord[] = [];
    const scannedPaths = new Set<string>();

    for await (const scanned of this._scanner.scan(folders)) {
      totalFiles++;
      scannedPaths.add(scanned.path);

      // Incremental: skip unchanged files unless full rescan requested
      if (!options?.fullRescan) {
        const existing = await this._indexer.getByPath(scanned.path);
        if (existing && existing.mtime === scanned.mtime && existing.size === scanned.size) {
          continue;
        }
        if (existing) updatedFiles++;
        else newFiles++;
      } else {
        newFiles++;
      }

      const extracted = await this._extractor.extract(scanned.path);

      if (extracted.extractionError) {
        errors.push({ path: scanned.path, error: extracted.extractionError });
      }

      batch.push(this._buildRecord(scanned, extracted));

      // Flush in batches of 100 for performance
      if (batch.length >= 100) {
        await this._indexer.upsertFiles(batch);
        batch.length = 0;
      }

      options?.onProgress?.({
        type: 'scan:progress',
        scanned: totalFiles,
        total: null,
      });
    }

    if (batch.length > 0) {
      await this._indexer.upsertFiles(batch);
    }

    // Detect deleted files: paths in index but no longer on disk
    for (const folder of folders) {
      const indexedPaths = await this._indexer.getPathsInFolder(folder);
      for (const indexedPath of indexedPaths) {
        if (!scannedPaths.has(indexedPath)) {
          await this._indexer.deleteFile(indexedPath);
          deletedFiles++;
        }
      }
    }

    return {
      totalFiles,
      newFiles,
      updatedFiles,
      deletedFiles,
      errors,
      durationMs: Date.now() - start,
    };
  }

  // ============================================================
  // Phase 2: Search & Query
  // ============================================================

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return this._indexer.search(query, options);
  }

  async browseFiles(options?: BrowseOptions): Promise<BrowseResult[]> {
    return this._indexer.browseFiles(options);
  }

  async getFilterOptions(): Promise<FilterOptions> {
    return this._indexer.getFilterOptions();
  }

  async exportDescriptions(): Promise<FileRecord[]> {
    return this._indexer.exportDescriptions();
  }

  async getFolders(): Promise<FolderInfo[]> {
    return this._indexer.getFolders();
  }

  // ============================================================
  // File Operations (single-file, uses Executor + TransactionLog)
  // ============================================================

  async moveFile(source: string, destination: string): Promise<{ success: boolean; transactionId: number | null }> {
    const plan: ActionPlan = {
      intent: `Move ${basename(source)}`,
      actions: [{ id: randomUUID(), type: 'move_file', source, destination, reason: 'User move', confidence: 1.0 }],
      needsReview: [],
      summary: { filesAffected: 1, foldersCreated: 0, totalSizeBytes: 0 },
      warnings: [],
    };
    const result = await this._executor.execute(plan);
    const actionResult = result.results[0];

    if (actionResult?.success) {
      const actualDest = actionResult.transactionId
        ? this._txLog.getTransaction(actionResult.transactionId)?.destPath ?? destination
        : destination;
      const record = await this._indexer.getByPath(source);
      if (record) {
        await this._indexer.deleteFile(source);
        await this._indexer.upsertFile({ ...record, path: actualDest, name: basename(actualDest), indexedAt: Date.now() });
      }
    }
    return { success: actionResult?.success ?? false, transactionId: actionResult?.transactionId ?? null };
  }

  async copyFile(source: string, destination: string): Promise<{ success: boolean; transactionId: number | null }> {
    const plan: ActionPlan = {
      intent: `Copy ${basename(source)}`,
      actions: [{ id: randomUUID(), type: 'copy_file', source, destination, reason: 'User copy', confidence: 1.0 }],
      needsReview: [],
      summary: { filesAffected: 1, foldersCreated: 0, totalSizeBytes: 0 },
      warnings: [],
    };
    const result = await this._executor.execute(plan);
    const actionResult = result.results[0];

    if (actionResult?.success) {
      const actualDest = actionResult.transactionId
        ? this._txLog.getTransaction(actionResult.transactionId)?.destPath ?? destination
        : destination;
      // Re-scan the copy to add it to the index
      const srcRecord = await this._indexer.getByPath(source);
      if (srcRecord) {
        await this._indexer.upsertFile({ ...srcRecord, id: 0, path: actualDest, name: basename(actualDest), indexedAt: Date.now() });
      }
    }
    return { success: actionResult?.success ?? false, transactionId: actionResult?.transactionId ?? null };
  }

  async renameFile(filePath: string, newName: string): Promise<{ success: boolean; transactionId: number | null }> {
    const destination = join(dirname(filePath), newName);
    const plan: ActionPlan = {
      intent: `Rename ${basename(filePath)} to ${newName}`,
      actions: [{ id: randomUUID(), type: 'rename_file', source: filePath, destination, reason: 'User rename', confidence: 1.0 }],
      needsReview: [],
      summary: { filesAffected: 1, foldersCreated: 0, totalSizeBytes: 0 },
      warnings: [],
    };
    const result = await this._executor.execute(plan);
    const actionResult = result.results[0];

    if (actionResult?.success) {
      const actualDest = actionResult.transactionId
        ? this._txLog.getTransaction(actionResult.transactionId)?.destPath ?? destination
        : destination;
      const record = await this._indexer.getByPath(filePath);
      if (record) {
        await this._indexer.deleteFile(filePath);
        await this._indexer.upsertFile({ ...record, path: actualDest, name: basename(actualDest), extension: extname(actualDest).slice(1).toLowerCase(), indexedAt: Date.now() });
      }
    }
    return { success: actionResult?.success ?? false, transactionId: actionResult?.transactionId ?? null };
  }

  async deleteFile(filePath: string): Promise<{ success: boolean }> {
    try {
      await rm(filePath);
      await this._indexer.deleteFile(filePath);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  // ============================================================
  // Smart Folder Creation
  // ============================================================

  async smartFolderAsk(
    folderName: string,
    description: string,
    messages: SmartFolderMessage[],
  ): Promise<SmartFolderResponse> {
    const response = await this._ai.smartFolderConverse(folderName, description, messages);

    if (response.done && response.criteria) {
      const browseOpts: BrowseOptions = { ...response.criteria, limit: 200 };
      const matches = await this._indexer.browseFiles(browseOpts);
      response.matchCount = matches.length;
    }

    return response;
  }

  async smartFolderPreview(criteria: SmartFolderCriteria): Promise<BrowseResult[]> {
    return this._indexer.browseFiles({ ...criteria, limit: 200 });
  }

  async smartFolderCreate(
    folderPath: string,
    filePaths: string[],
  ): Promise<ExecutionResult> {
    const actions: Action[] = [
      {
        id: randomUUID(),
        type: 'create_folder',
        source: folderPath,
        destination: folderPath,
        reason: 'Smart folder creation',
        confidence: 1.0,
      },
      ...filePaths.map((fp) => ({
        id: randomUUID(),
        type: 'move_file' as const,
        source: fp,
        destination: join(folderPath, basename(fp)),
        reason: 'Smart folder auto-sort',
        confidence: 1.0,
      })),
    ];

    const plan: ActionPlan = {
      intent: `Create smart folder: ${basename(folderPath)}`,
      actions,
      needsReview: [],
      summary: { filesAffected: filePaths.length, foldersCreated: 1, totalSizeBytes: 0 },
      warnings: [],
    };

    return this.execute(plan);
  }

  async getStats(): Promise<IndexStats> {
    const stats = await this._indexer.getStats();

    const watchedFolders: IndexStats['watchedFolders'] = [];
    for (const folder of this._config.watchedFolders) {
      const fileCount = await this._indexer.getFileCountInFolder(folder);
      watchedFolders.push({
        path: folder,
        fileCount,
        lastScanAt: stats.lastScanAt,
      });
    }

    return { ...stats, watchedFolders };
  }

  async getFile(path: string): Promise<FileRecord | null> {
    return this._indexer.getByPath(path);
  }

  // ============================================================
  // Phase C: Watch
  // ============================================================

  async startWatching(onEvent?: (event: WatcherEvent) => void): Promise<void> {
    if (this._watcher) return;

    this._watcher = new Watcher({
      watchedFolders: this._config.watchedFolders,
      debounceMs: 100,
      excludePatterns: this._config.excludePatterns,
      followSymlinks: this._config.followSymlinks,
      includeHidden: this._config.includeHidden,
    });

    this._watcher.onEvent((event) => {
      onEvent?.(event);
      void this._handleWatchEvent(event);
    });

    await this._watcher.start();
  }

  async stopWatching(): Promise<void> {
    if (this._watcher) {
      await this._watcher.stop();
      this._watcher = null;
    }
  }

  get isWatching(): boolean {
    return this._watcher?.isWatching ?? false;
  }

  private async _handleWatchEvent(event: WatcherEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'file:created':
        case 'file:modified': {
          const fileStat = await stat(event.path);
          if (fileStat.isDirectory()) return;
          const scanned: ScannedFile = {
            path: event.path,
            name: basename(event.path),
            extension: extname(event.path).slice(1).toLowerCase(),
            size: fileStat.size,
            mtime: fileStat.mtimeMs,
            ctime: fileStat.ctimeMs,
            isSymlink: false,
            isDirectory: false,
          };
          const extracted = await this._extractor.extract(event.path);
          const record = this._buildRecord(scanned, extracted);
          await this._indexer.upsertFile(record);
          break;
        }
        case 'file:deleted':
          await this._indexer.deleteFile(event.path);
          break;
        case 'file:renamed': {
          await this._indexer.deleteFile(event.oldPath);
          try {
            const fileStat = await stat(event.newPath);
            if (!fileStat.isDirectory()) {
              const scanned: ScannedFile = {
                path: event.newPath,
                name: basename(event.newPath),
                extension: extname(event.newPath).slice(1).toLowerCase(),
                size: fileStat.size,
                mtime: fileStat.mtimeMs,
                ctime: fileStat.ctimeMs,
                isSymlink: false,
                isDirectory: false,
              };
              const extracted = await this._extractor.extract(event.newPath);
              const record = this._buildRecord(scanned, extracted);
              await this._indexer.upsertFile(record);
            }
          } catch {
            // New path may not exist if renamed outside watched folders
          }
          break;
        }
        case 'error':
          break;
      }
    } catch (err) {
      // File may disappear between event and stat — log but don't crash
      if (process.env.FILEMOM_DEBUG) {
        console.error(`[FileMom] Watch event error:`, err);
      }
    }
  }

  // ============================================================
  // Phase D: Embeddings
  // ============================================================

  async embedFiles(options?: { limit?: number }): Promise<EmbeddingResult> {
    if (!this._embeddings) {
      throw new EmbeddingError('Embeddings not enabled. Set enableEmbeddings: true in config.');
    }

    const limit = options?.limit ?? 100;
    const unembedded = await this._indexer.getUnembedded({ limit });

    if (unembedded.length === 0) {
      return { embedded: 0, skipped: 0, errors: [], durationMs: 0 };
    }

    const files = unembedded.map((f) => ({
      id: f.id,
      text: this._buildEmbeddingText(f),
    }));

    return this._embeddings.embedBatch(files);
  }

  async semanticSearch(query: string, options?: SemanticSearchOptions): Promise<HybridSearchResult[]> {
    if (!this._embeddings) {
      throw new EmbeddingError('Embeddings not enabled. Set enableEmbeddings: true in config.');
    }
    return this._indexer.hybridSearch(query, this._embeddings, options);
  }

  private _buildEmbeddingText(record: FileRecord): string {
    const parts: string[] = [record.name];
    if (record.extractedText) parts.push(record.extractedText.slice(0, 1500));
    if (record.visionDescription) parts.push(record.visionDescription);
    if (record.visionTags) {
      try {
        const tags = JSON.parse(record.visionTags);
        if (Array.isArray(tags)) parts.push(tags.join(', '));
      } catch { /* ignore */ }
    }
    return parts.join(' | ');
  }

  // ============================================================
  // Phase V2-4: AI Descriptions
  // ============================================================

  async describeFiles(options?: {
    limit?: number;
    onProgress?: (done: number, total: number) => void;
  }): Promise<DescriptionResult> {
    if (!this._describer) {
      throw new AIError('AI descriptions not enabled. Set enableAIDescriptions: true in config.');
    }

    const start = Date.now();
    const limit = options?.limit ?? this._config.descriptionBatchSize;
    const undescribed = await this._indexer.getUndescribed({ limit });

    if (undescribed.length === 0) {
      return { described: 0, skipped: 0, errors: [], cost: 0, durationMs: 0 };
    }

    const results = await this._describer.describeBatch(undescribed, options?.onProgress);
    const errors: Array<{ path: string; error: string }> = [];
    let described = 0;

    for (const file of undescribed) {
      const result = results.get(file.path);
      if (result) {
        await this._indexer.upsertFile({ ...file, ...result });
        described++;
      } else {
        errors.push({ path: file.path, error: 'AI description failed' });
      }
    }

    return {
      described,
      skipped: undescribed.length - described - errors.length,
      errors,
      cost: this._describer.getCost(),
      durationMs: Date.now() - start,
    };
  }

  async describeFile(path: string): Promise<DescriptionFields> {
    if (!this._describer) {
      throw new AIError('AI descriptions not enabled. Set enableAIDescriptions: true in config.');
    }

    const record = await this._indexer.getByPath(path);
    if (!record) {
      throw new AIError(`File not found in index: ${path}`);
    }

    const result = await this._describer.describeFile(record);
    await this._indexer.upsertFile({ ...record, ...result });
    return result;
  }

  async getUndescribedCount(): Promise<number> {
    return this._indexer.getUndescribedCount();
  }

  getDescriptionCost(): number {
    return this._describer?.getCost() ?? 0;
  }

  // ============================================================
  // Phase 1.5: Vision Enrichment
  // ============================================================

  async enrichFiles(options?: { limit?: number; onProgress?: (done: number, total: number) => void }): Promise<EnrichmentResult> {
    if (!this._vision) {
      throw new AIError('Vision enrichment is not enabled. Set enableVisionEnrichment: true in config.');
    }

    const start = Date.now();
    const limit = options?.limit ?? this._config.visionBatchSize;

    const unenriched = await this._indexer.getUnenriched({
      minTextThreshold: this._config.visionMinTextThreshold,
      limit,
    });

    if (unenriched.length === 0) {
      return { enriched: 0, skipped: 0, errors: [], cost: 0, durationMs: Date.now() - start };
    }

    const results = await this._vision.enrichBatch(unenriched, options?.onProgress);
    const errors: Array<{ path: string; error: string }> = [];
    let enriched = 0;

    for (const file of unenriched) {
      const result = results.get(file.path);
      if (result) {
        await this._indexer.upsertFile({
          ...file,
          visionDescription: result.description,
          visionCategory: result.category,
          visionTags: JSON.stringify(result.tags),
          enrichedAt: result.enrichedAt,
        });
        enriched++;
      } else {
        errors.push({ path: file.path, error: 'Vision enrichment failed' });
      }
    }

    return {
      enriched,
      skipped: unenriched.length - enriched - errors.length,
      errors,
      cost: this._vision.getCost(),
      durationMs: Date.now() - start,
    };
  }

  async enrichFile(path: string): Promise<VisionResult> {
    if (!this._vision) {
      throw new AIError('Vision enrichment is not enabled. Set enableVisionEnrichment: true in config.');
    }

    const result = await this._vision.enrichFile(path);

    // Update the record in the index
    const existing = await this._indexer.getByPath(path);
    if (existing) {
      await this._indexer.upsertFile({
        ...existing,
        visionDescription: result.description,
        visionCategory: result.category,
        visionTags: JSON.stringify(result.tags),
        enrichedAt: result.enrichedAt,
      });
    }

    return result;
  }

  getVisionCost(): number {
    return this._vision?.getCost() ?? 0;
  }

  async getUnenrichedCount(): Promise<number> {
    return this._indexer.getUnenrichedCount({
      minTextThreshold: this._config.visionMinTextThreshold,
    });
  }

  async getUnembeddedCount(): Promise<number> {
    return this._indexer.getUnembeddedCount();
  }

  getFeatureFlags(): { enableVisionEnrichment: boolean; enableEmbeddings: boolean; enableAIDescriptions: boolean } {
    return {
      enableVisionEnrichment: this._config.enableVisionEnrichment,
      enableEmbeddings: this._config.enableEmbeddings,
      enableAIDescriptions: this._config.enableAIDescriptions,
    };
  }

  async updateFeatureFlags(flags: { enableVisionEnrichment?: boolean; enableEmbeddings?: boolean; enableAIDescriptions?: boolean }): Promise<void> {
    if (flags.enableVisionEnrichment !== undefined) {
      this._config.enableVisionEnrichment = flags.enableVisionEnrichment;
      if (flags.enableVisionEnrichment && !this._vision) {
        this._vision = new VisionEnricher({
          apiKey: this._config.openRouterApiKey,
          model: this._config.visionModel,
          maxImageDimension: this._config.visionMaxImageDimension,
          batchSize: this._config.visionBatchSize,
          concurrency: 5,
          retryAttempts: this._config.retryAttempts,
          retryDelayMs: this._config.retryDelayMs,
        });
      } else if (!flags.enableVisionEnrichment) {
        this._vision = null;
      }
    }

    if (flags.enableEmbeddings !== undefined) {
      this._config.enableEmbeddings = flags.enableEmbeddings;
      if (flags.enableEmbeddings && !this._embeddings) {
        this._embeddings = new Embeddings({
          model: this._config.embeddingModel,
          dimensions: this._config.embeddingDimensions,
          dbPath: join(this._config.dataDir, 'index.db'),
        });
        await this._embeddings.initialize();
      } else if (!flags.enableEmbeddings && this._embeddings) {
        await this._embeddings.close();
        this._embeddings = null;
      }
    }

    if (flags.enableAIDescriptions !== undefined) {
      this._config.enableAIDescriptions = flags.enableAIDescriptions;
      if (flags.enableAIDescriptions && !this._describer) {
        this._describer = new Describer({
          apiKey: this._config.openRouterApiKey,
          visionModel: this._config.visionModel,
          textModel: this._config.descriptionModel,
          concurrency: this._config.descriptionMaxConcurrent,
          retryAttempts: this._config.retryAttempts,
          retryDelayMs: this._config.retryDelayMs,
          maxImageDimension: this._config.visionMaxImageDimension,
        });
      } else if (!flags.enableAIDescriptions) {
        this._describer = null;
      }
    }
  }

  // ============================================================
  // Phase 5: Plan (AI Interface)
  // ============================================================

  async plan(command: string, options?: PlanOptions): Promise<ActionPlan> {
    const maxFiles = options?.maxFiles ?? this._config.maxFilesPerRequest;

    // 1. Get index context for query expansion
    const folders = await this._indexer.getTopFolders(50);
    const stats = await this._indexer.getStats();

    // 2. AI-powered query expansion (cheap call ~$0.001)
    const expansion = await this._ai.expandQuery(command, folders, stats);

    // Store expansion for CLI to display
    this._lastExpansion = expansion;

    // 3. Multi-query search: run each keyword + folder pattern
    const fileEntries: FileIndexEntry[] = [];
    const seenPaths = new Set<string>();

    // Search by each expanded keyword
    for (const keyword of expansion.keywords) {
      const results = await this._indexer.search(keyword, {
        limit: Math.ceil(maxFiles / expansion.keywords.length),
        extensions: expansion.extensions.length > 0 ? expansion.extensions : undefined,
      });
      for (const r of results) {
        if (!seenPaths.has(r.path)) {
          const record = await this._indexer.getByPath(r.path);
          if (record) {
            fileEntries.push(this._recordToIndexEntry(record));
            seenPaths.add(r.path);
          }
        }
      }
    }

    // Search by folder patterns (path substring match)
    for (const pattern of expansion.folderPatterns) {
      const results = await this._indexer.searchByPath(pattern, {
        limit: Math.ceil(maxFiles / Math.max(expansion.folderPatterns.length, 1)),
      });
      for (const r of results) {
        if (!seenPaths.has(r.path)) {
          fileEntries.push(this._recordToIndexEntry(r));
          seenPaths.add(r.path);
        }
      }
    }

    // If still too few results, supplement with recent files
    if (fileEntries.length < 20) {
      const recent = await this._indexer.getRecent(maxFiles - fileEntries.length);
      for (const record of recent) {
        if (!seenPaths.has(record.path)) {
          fileEntries.push(this._recordToIndexEntry(record));
          seenPaths.add(record.path);
        }
      }
    }

    // Cap at maxFiles
    const cappedEntries = fileEntries.slice(0, maxFiles);

    // Preview mode: return file matches without calling AI
    if (options?.previewOnly) {
      return {
        intent: `Preview: ${command}`,
        actions: [],
        needsReview: [],
        summary: { filesAffected: cappedEntries.length, foldersCreated: 0, totalSizeBytes: 0 },
        warnings: [
          `Preview only — ${cappedEntries.length} files matched. No AI call made.`,
          `Query expansion: ${expansion.keywords.join(', ')}`,
          `Reasoning: ${expansion.reasoning}`,
        ],
      };
    }

    return this._ai.generatePlan(command, cappedEntries, options);
  }

  async refinePlan(options: RefinePlanOptions): Promise<ActionPlan> {
    return this._ai.refinePlan(options.plan, options.feedback, options.history);
  }

  getAICost(): number {
    return this._ai.getCost();
  }

  getLastExpansion(): QueryExpansion | null {
    return this._lastExpansion;
  }

  // ============================================================
  // Phase 6: Execute & Undo
  // ============================================================

  async execute(plan: ActionPlan, options?: ExecuteOptions): Promise<ExecutionResult> {
    const result = await this._executor.execute(plan, {
      dryRun: options?.dryRun,
      stopOnError: options?.stopOnError,
      onProgress: options?.onProgress,
    });

    // Update index for successfully moved/renamed files
    for (const actionResult of result.results) {
      if (!actionResult.success) continue;
      const action = plan.actions.find((a) => a.id === actionResult.actionId);
      if (!action) continue;

      if (action.type === 'move_file' || action.type === 'rename_file' || action.type === 'copy_file') {
        // Use ACTUAL destination from transaction log (may differ from planned due to collision resolution)
        let actualDest = action.destination;
        if (actionResult.transactionId) {
          const tx = this._txLog.getTransaction(actionResult.transactionId);
          if (tx) actualDest = tx.destPath;
        }

        const record = await this._indexer.getByPath(action.source);
        if (record) {
          if (action.type !== 'copy_file') {
            await this._indexer.deleteFile(action.source);
          }
          await this._indexer.upsertFile({
            ...record,
            id: action.type === 'copy_file' ? 0 : record.id,
            path: actualDest,
            name: basename(actualDest),
            extension: extname(actualDest).slice(1).toLowerCase() || record.extension,
            indexedAt: Date.now(),
          });
        }
      }
    }

    return result;
  }

  async undo(batchId: string): Promise<{ success: boolean; restored: number; errors: string[] }> {

    const transactions = this._txLog.getBatchTransactions(batchId);
    if (transactions.length === 0) {
      throw new AIError(`No undoable transactions found for batch ${batchId}`);
    }

    if (transactions[0].expiresAt < Date.now()) {
      throw new AIError(`Batch ${batchId} has expired and cannot be undone`);
    }

    const errors: string[] = [];
    let restored = 0;

    // Reverse in LIFO order (already sorted DESC by id)
    for (const tx of transactions) {
      try {
        switch (tx.actionType) {
          case 'move_file':
          case 'rename_file': {
            if (!(await pathExists(tx.destPath))) {
              errors.push(`${tx.actionType} ${tx.sourcePath}: file no longer exists at ${tx.destPath}`);
              break;
            }
            await safeCopy(tx.destPath, tx.sourcePath);
            await rm(tx.destPath);
            const record = await this._indexer.getByPath(tx.destPath);
            if (record) {
              await this._indexer.deleteFile(tx.destPath);
              await this._indexer.upsertFile({
                ...record,
                path: tx.sourcePath,
                name: basename(tx.sourcePath),
                indexedAt: Date.now(),
              });
            }
            restored++;
            break;
          }

          case 'copy_file':
            await rm(tx.destPath);
            restored++;
            break;

          case 'create_folder':
            try { await rmdir(tx.destPath); restored++; } catch { /* not empty */ }
            break;
        }
      } catch (err) {
        errors.push(`${tx.actionType} ${tx.sourcePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this._txLog.markRolledBack(batchId);
    return { success: errors.length === 0, restored, errors };
  }

  async getUndoableBatches(): Promise<BatchSummary[]> {
    this._txLog.cleanupExpired();
    return this._txLog.getUndoable();
  }

  // ============================================================
  // Internal
  // ============================================================

  private _recordToIndexEntry(record: FileRecord): FileIndexEntry {
    let summary: string | null = null;

    if (record.extractedText) {
      summary = record.extractedText.slice(0, 200);
    } else if (record.exifJson) {
      try {
        const exif = JSON.parse(record.exifJson);
        const parts: string[] = [];
        if (exif.dateTaken) parts.push(`Taken: ${exif.dateTaken}`);
        if (exif.camera) parts.push(exif.camera);
        if (exif.gps) {
          parts.push(`GPS: ${exif.gps.latitude.toFixed(4)},${exif.gps.longitude.toFixed(4)}`);
        }
        summary = parts.join(', ') || null;
      } catch {
        /* ignore bad JSON */
      }
    }

    return {
      id: record.id,
      path: record.path,
      name: record.name,
      extension: record.extension,
      size: record.size,
      modifiedDate: new Date(record.mtime).toISOString().split('T')[0],
      summary,
      visionDescription: record.visionDescription,
    };
  }

  private _buildRecord(scanned: ScannedFile, extracted: ExtractedMetadata): FileRecord {
    return {
      id: 0,
      path: scanned.path,
      name: scanned.name,
      extension: scanned.extension,
      size: scanned.size,
      mtime: scanned.mtime,
      ctime: scanned.ctime,
      quickHash: extracted.quickHash,
      extractedText: extracted.extractedText,
      exifJson: extracted.exif ? JSON.stringify(extracted.exif) : null,
      detectedMimeType: extracted.detectedMimeType,
      indexedAt: Date.now(),
      embeddingId: null,
      visionDescription: null,
      visionCategory: null,
      visionTags: null,
      enrichedAt: null,
      aiDescription: null,
      aiCategory: null,
      aiSubcategory: null,
      aiTags: null,
      aiDateContext: null,
      aiSource: null,
      aiContentType: null,
      aiConfidence: null,
      aiSensitive: null,
      aiSensitiveType: null,
      aiDetails: null,
      aiDescribedAt: null,
      aiDescriptionModel: null,
    };
  }
}
