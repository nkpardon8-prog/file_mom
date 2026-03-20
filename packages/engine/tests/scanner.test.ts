import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scanner } from '../src/scanner.js';
import type { ScannerConfig } from '../src/scanner.js';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'filemom-scan-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeScanner(overrides: Partial<ScannerConfig> = {}) {
  return new Scanner({
    excludePatterns: [],
    includeHidden: false,
    followSymlinks: false,
    ...overrides,
  });
}

describe('Scanner', () => {
  it('finds all files in directory', async () => {
    await writeFile(join(tempDir, 'file1.txt'), 'hello');
    await writeFile(join(tempDir, 'file2.pdf'), 'world');
    await writeFile(join(tempDir, 'file3.jpg'), 'image');

    const scanner = makeScanner();
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(3);
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(['file1.txt', 'file2.pdf', 'file3.jpg']);
  });

  it('handles nested directories', async () => {
    await mkdir(join(tempDir, 'sub', 'deep'), { recursive: true });
    await writeFile(join(tempDir, 'top.txt'), 'a');
    await writeFile(join(tempDir, 'sub', 'mid.txt'), 'b');
    await writeFile(join(tempDir, 'sub', 'deep', 'bottom.txt'), 'c');

    const scanner = makeScanner();
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(3);
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(['bottom.txt', 'mid.txt', 'top.txt']);
  });

  it('skips hidden files when configured', async () => {
    await writeFile(join(tempDir, '.hidden'), 'secret');
    await writeFile(join(tempDir, 'visible.txt'), 'visible');

    const scanner = makeScanner({ includeHidden: false });
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('visible.txt');
  });

  it('includes hidden files when configured', async () => {
    await writeFile(join(tempDir, '.hidden'), 'secret');
    await writeFile(join(tempDir, 'visible.txt'), 'visible');

    const scanner = makeScanner({ includeHidden: true });
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(2);
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(['.hidden', 'visible.txt']);
  });

  it('skips iCloud placeholder files (dot-prefixed)', async () => {
    // iCloud placeholders look like .filename.ext.icloud
    await writeFile(join(tempDir, '.photo.jpg.icloud'), 'placeholder');
    await writeFile(join(tempDir, 'real.jpg'), 'real');

    const scanner = makeScanner({ includeHidden: false });
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('real.jpg');
  });

  it('respects exclude patterns', async () => {
    await writeFile(join(tempDir, 'app.ts'), 'code');
    await writeFile(join(tempDir, 'debug.log'), 'logs');
    await writeFile(join(tempDir, 'error.log'), 'errors');

    const scanner = makeScanner({ excludePatterns: ['**/*.log'] });
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('app.ts');
  });

  it('handles empty directories', async () => {
    const scanner = makeScanner();
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(0);
  });

  it('handles non-existent paths gracefully', async () => {
    await writeFile(join(tempDir, 'exists.txt'), 'here');

    const scanner = makeScanner();
    const files = await scanner.scanAll([tempDir, '/nonexistent/path/that/does/not/exist']);

    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => f.name === 'exists.txt')).toBe(true);
  });

  it('yields correct ScannedFile shape', async () => {
    await writeFile(join(tempDir, 'test.pdf'), 'pdf content here');

    const scanner = makeScanner();
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(1);
    const file = files[0];

    expect(file.path).toContain('test.pdf');
    expect(file.name).toBe('test.pdf');
    expect(file.extension).toBe('pdf');
    expect(file.size).toBeGreaterThan(0);
    expect(file.mtime).toBeGreaterThan(0);
    expect(file.ctime).toBeGreaterThan(0);
    expect(file.isSymlink).toBe(false);
    expect(file.isDirectory).toBe(false);
  });

  it('can be stopped by breaking from generator', async () => {
    for (let i = 0; i < 10; i++) {
      await writeFile(join(tempDir, `file${i}.txt`), `content ${i}`);
    }

    const scanner = makeScanner();
    const collected: string[] = [];

    for await (const file of scanner.scan([tempDir])) {
      collected.push(file.name);
      if (collected.length >= 3) break;
    }

    expect(collected).toHaveLength(3);
  });

  it('scans multiple folders simultaneously', async () => {
    const dir1 = join(tempDir, 'dir1');
    const dir2 = join(tempDir, 'dir2');
    await mkdir(dir1, { recursive: true });
    await mkdir(dir2, { recursive: true });
    await writeFile(join(dir1, 'a.txt'), 'from dir1');
    await writeFile(join(dir2, 'b.txt'), 'from dir2');

    const scanner = makeScanner();
    const files = await scanner.scanAll([dir1, dir2]);

    expect(files).toHaveLength(2);
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(['a.txt', 'b.txt']);
  });

  it('handles paths with spaces and unicode', async () => {
    const dirWithSpaces = join(tempDir, 'dir with spaces');
    await mkdir(dirWithSpaces, { recursive: true });
    await writeFile(join(dirWithSpaces, 'café.txt'), 'unicode content');

    const scanner = makeScanner();
    const files = await scanner.scanAll([dirWithSpaces]);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('café.txt');
  });

  it('handles files with no extension', async () => {
    await writeFile(join(tempDir, 'Makefile'), 'all: build');
    await writeFile(join(tempDir, 'LICENSE'), 'MIT');

    const scanner = makeScanner();
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(2);
    for (const file of files) {
      expect(file.extension).toBe('');
    }
  });

  it('handles files with multiple dots in name', async () => {
    await writeFile(join(tempDir, 'file.test.ts'), 'test code');
    await writeFile(join(tempDir, 'archive.tar.gz'), 'compressed');

    const scanner = makeScanner();
    const files = await scanner.scanAll([tempDir]);
    const byName = Object.fromEntries(files.map((f) => [f.name, f]));

    expect(byName['file.test.ts'].extension).toBe('ts');
    expect(byName['archive.tar.gz'].extension).toBe('gz');
  });

  it('handles deeply nested directories (10 levels)', async () => {
    let path = tempDir;
    for (let i = 0; i < 10; i++) {
      path = join(path, `level${i}`);
    }
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'deep.txt'), 'deep content');

    const scanner = makeScanner();
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('deep.txt');
    expect(files[0].path).toContain('level9');
  });

  it('returns empty for empty folder array', async () => {
    const scanner = makeScanner();
    const files = await scanner.scanAll([]);
    expect(files).toHaveLength(0);
  });

  it('excludes patterns with specific extensions', async () => {
    await writeFile(join(tempDir, 'keep.ts'), 'code');
    await writeFile(join(tempDir, 'skip.test.ts'), 'test');

    const scanner = makeScanner({ excludePatterns: ['**/*.test.ts'] });
    const files = await scanner.scanAll([tempDir]);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('keep.ts');
  });

  it('finds files in hidden directories when includeHidden is true', async () => {
    const hiddenDir = join(tempDir, '.hidden_dir');
    await mkdir(hiddenDir, { recursive: true });
    await writeFile(join(hiddenDir, 'file.txt'), 'hidden content');

    const scanner = makeScanner({ includeHidden: true });
    const files = await scanner.scanAll([tempDir]);

    expect(files.some((f) => f.name === 'file.txt')).toBe(true);
  });

  it('follows symlinks when configured', async () => {
    const realDir = join(tempDir, 'real');
    const linkDir = join(tempDir, 'link');
    await mkdir(realDir, { recursive: true });
    await writeFile(join(realDir, 'target.txt'), 'real file');
    await symlink(realDir, linkDir, 'dir');

    const scanner = makeScanner({ followSymlinks: true });
    const files = await scanner.scanAll([linkDir]);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('target.txt');
  });

  it('includeHidden works when excludePatterns has common ignores but not **/.*', async () => {
    await writeFile(join(tempDir, '.env'), 'SECRET=123');
    await writeFile(join(tempDir, '.bashrc'), 'alias ls="ls -la"');
    await writeFile(join(tempDir, 'visible.txt'), 'normal file');

    const scanner = makeScanner({
      includeHidden: true,
      excludePatterns: [
        '**/node_modules/**',
        '**/.git/**',
        '**/*.tmp',
        '**/Thumbs.db',
        '**/.DS_Store',
      ],
    });
    const files = await scanner.scanAll([tempDir]);

    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(['.bashrc', '.env', 'visible.txt']);
  });

  it('excludePatterns **/. overrides includeHidden (conflict demonstration)', async () => {
    await writeFile(join(tempDir, '.env'), 'SECRET=123');
    await writeFile(join(tempDir, 'visible.txt'), 'normal file');

    const scanner = makeScanner({
      includeHidden: true,
      excludePatterns: ['**/.*'],
    });
    const files = await scanner.scanAll([tempDir]);

    // Demonstrates the conflict: includeHidden is true but **/. excludes all hidden files
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('visible.txt');
  });
});
