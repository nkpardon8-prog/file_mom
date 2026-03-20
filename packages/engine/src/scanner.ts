import fg from 'fast-glob';
import { extname, basename } from 'node:path';
import { normalizePath } from './utils/path.js';
import type { ScannedFile } from './types.js';

export interface ScannerConfig {
  excludePatterns: string[];
  includeHidden: boolean;
  followSymlinks: boolean;
}

export class Scanner {
  constructor(private _config: ScannerConfig) {}

  async *scan(folders: string[]): AsyncGenerator<ScannedFile> {
    if (folders.length === 0) {
      return;
    }

    const patterns = folders.map((folder) => {
      const normalized = normalizePath(folder);
      return `${fg.convertPathToPattern(normalized)}/**/*`;
    });

    const stream = fg.globStream(patterns, {
      dot: this._config.includeHidden,
      followSymbolicLinks: this._config.followSymlinks,
      suppressErrors: true,
      stats: true,
      ignore: this._config.excludePatterns,
      onlyFiles: true,
      absolute: true,
    });

    for await (const entry of stream) {
      const e = entry as unknown as fg.Entry;
      const stats = e.stats!;
      yield {
        path: normalizePath(e.path),
        name: basename(e.path),
        extension: extname(e.path).slice(1).toLowerCase(),
        size: stats.size,
        mtime: stats.mtimeMs,
        ctime: stats.ctimeMs,
        isSymlink: e.dirent.isSymbolicLink(),
        isDirectory: false,
      };
    }
  }

  async scanAll(folders: string[]): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];
    for await (const file of this.scan(folders)) {
      files.push(file);
    }
    return files;
  }
}
