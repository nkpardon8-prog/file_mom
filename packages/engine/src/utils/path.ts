import { resolve, normalize } from 'node:path';

// TODO: Flesh out in Phase 1

/** Normalize and resolve a path to absolute */
export function normalizePath(inputPath: string): string {
  return resolve(normalize(inputPath));
}

/** Check if a file path is within a given folder */
export function isWithinFolder(filePath: string, folderPath: string): boolean {
  const normalizedFile = normalizePath(filePath);
  let normalizedFolder = normalizePath(folderPath);
  // Strip trailing separator to avoid double-slash
  if (normalizedFolder.endsWith('/')) {
    normalizedFolder = normalizedFolder.slice(0, -1);
  }
  return normalizedFile.startsWith(normalizedFolder + '/');
}
