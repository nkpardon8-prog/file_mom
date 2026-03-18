export interface WatcherConfig {
  watchedFolders: string[];
  debounceMs: number;
}

// TODO: Implement in Phase 4
export class Watcher {
  constructor(private _config: WatcherConfig) {}

  async start(): Promise<void> {
    // Phase 4: chokidar native events, debounce, batch processing
  }

  async stop(): Promise<void> {
    // Phase 4: close watchers
  }
}
