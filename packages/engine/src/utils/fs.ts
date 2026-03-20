import { copyFile, stat, mkdir, access, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { quickHash } from './hash.js';

/**
 * Copy a file and verify the copy matches the original.
 * Uses copyFile (not fs.cp) for single files — preserves timestamps on macOS.
 * Creates parent directories if they don't exist.
 */
export async function safeCopy(src: string, dest: string): Promise<void> {
  // Ensure destination directory exists
  await mkdir(dirname(dest), { recursive: true });

  // Copy file — will overwrite if dest exists. Callers should use resolveCollision()
  // first for new files. Undo flow intentionally overwrites to restore originals.
  await copyFile(src, dest);

  // Verify: sizes must match
  const [srcStat, destStat] = await Promise.all([stat(src), stat(dest)]);
  if (srcStat.size !== destStat.size) {
    throw new Error(
      `Copy verification failed: size mismatch (src=${srcStat.size}, dest=${destStat.size})`,
    );
  }
}

/**
 * Verify two files are identical by size and quick hash.
 */
export async function verifyIdentical(path1: string, path2: string): Promise<boolean> {
  const [stat1, stat2] = await Promise.all([stat(path1), stat(path2)]);
  if (stat1.size !== stat2.size) return false;

  const [hash1, hash2] = await Promise.all([quickHash(path1), quickHash(path2)]);
  return hash1 === hash2;
}

/**
 * Check if a path exists (file or directory).
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a collision-free destination path.
 * If /path/to/file.pdf exists, tries /path/to/file (1).pdf, /path/to/file (2).pdf, etc.
 */
export async function resolveCollision(destPath: string): Promise<string> {
  if (!(await pathExists(destPath))) return destPath;

  const lastDot = destPath.lastIndexOf('.');
  const lastSlash = destPath.lastIndexOf('/');

  // Determine name and extension parts
  let basePath: string;
  let ext: string;

  if (lastDot > lastSlash + 1) {
    basePath = destPath.slice(0, lastDot);
    ext = destPath.slice(lastDot);
  } else {
    basePath = destPath;
    ext = '';
  }

  for (let i = 1; i <= 999; i++) {
    const candidate = `${basePath} (${i})${ext}`;
    if (!(await pathExists(candidate))) return candidate;
  }

  throw new Error(`Cannot resolve collision for ${destPath}: exhausted 999 attempts`);
}
