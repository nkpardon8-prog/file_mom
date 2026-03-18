import type { ScannedFile } from './types.js';

export interface ScannerConfig {
  excludePatterns: string[];
  includeHidden: boolean;
  followSymlinks: boolean;
}

// TODO: Implement in Phase 1
export class Scanner {
  constructor(private _config: ScannerConfig) {}

  async *scan(_folders: string[]): AsyncGenerator<ScannedFile> {
    // Phase 1: fast-glob traversal, skip hidden/cloud placeholders, emit progress
  }

  async scanAll(folders: string[]): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];
    for await (const file of this.scan(folders)) {
      files.push(file);
    }
    return files;
  }
}
