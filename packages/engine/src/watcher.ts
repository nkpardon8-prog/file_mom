import { watch, type FSWatcher, type ChokidarOptions } from 'chokidar';
import type { WatcherEvent } from './types.js';
import { WatcherError } from './errors.js';

export interface WatcherConfig {
  watchedFolders: string[];
  debounceMs: number;
  excludePatterns: string[];
  followSymlinks: boolean;
  includeHidden: boolean;
}

type WatcherEventHandler = (event: WatcherEvent) => void;

export class Watcher {
  private _fsWatcher: FSWatcher | null = null;
  private _handlers: Set<WatcherEventHandler> = new Set();

  constructor(private _config: WatcherConfig) {}

  get isWatching(): boolean {
    return this._fsWatcher !== null && !this._fsWatcher.closed;
  }

  onEvent(handler: WatcherEventHandler): void {
    this._handlers.add(handler);
  }

  offEvent(handler: WatcherEventHandler): void {
    this._handlers.delete(handler);
  }

  async start(): Promise<void> {
    if (this._fsWatcher) {
      throw new WatcherError('Watcher is already running');
    }

    const opts: ChokidarOptions = {
      ignoreInitial: true,
      followSymlinks: this._config.followSymlinks,
      awaitWriteFinish: {
        stabilityThreshold: this._config.debounceMs,
        pollInterval: Math.max(50, Math.floor(this._config.debounceMs / 2)),
      },
      persistent: true,
      ignorePermissionErrors: true,
    };

    this._fsWatcher = watch(this._config.watchedFolders, opts);

    this._fsWatcher.on('add', (path) => {
      if (!this._isExcluded(path)) {
        this._emit({ type: 'file:created', path });
      }
    });

    this._fsWatcher.on('change', (path) => {
      if (!this._isExcluded(path)) {
        this._emit({ type: 'file:modified', path });
      }
    });

    this._fsWatcher.on('unlink', (path) => {
      if (!this._isExcluded(path)) {
        this._emit({ type: 'file:deleted', path });
      }
    });

    this._fsWatcher.on('error', (error) => {
      this._emit({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });

    await new Promise<void>((resolve) => {
      this._fsWatcher!.on('ready', () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (this._fsWatcher) {
      await this._fsWatcher.close();
      this._fsWatcher = null;
    }
  }

  private _isExcluded(filePath: string): boolean {
    // Check exclude patterns (glob-style, matched against absolute paths)
    for (const pattern of this._config.excludePatterns) {
      if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
        const dir = pattern.slice(3, -3);
        if (filePath.includes(`/${dir}/`)) return true;
      } else if (pattern.startsWith('**/*.')) {
        const ext = pattern.slice(4); // "**/*.tmp" → ".tmp"
        if (filePath.endsWith(ext)) return true;
      } else if (pattern.startsWith('**/')) {
        const name = pattern.slice(3);
        if (filePath.endsWith(`/${name}`)) return true;
      }
    }
    // Check hidden files
    if (!this._config.includeHidden) {
      const segments = filePath.split('/');
      if (segments.some((s) => s.startsWith('.') && s.length > 1)) return true;
    }
    return false;
  }

  private _emit(event: WatcherEvent): void {
    for (const handler of this._handlers) {
      try {
        handler(event);
      } catch {
        // Don't let handler errors crash the watcher
      }
    }
  }
}
