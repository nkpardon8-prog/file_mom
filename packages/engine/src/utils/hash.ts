import xxhash from 'xxhash-wasm';
import { open } from 'node:fs/promises';

// Singleton WASM instance — lazy init, cached
let hasherPromise: ReturnType<typeof xxhash> | null = null;
function getHasher() {
  hasherPromise ??= xxhash();
  return hasherPromise;
}

const HASH_BYTES = 4096;

/**
 * Quick hash of a file: xxHash64 of first 4KB + file size.
 * Format: "hexstring-filesize"
 */
export async function quickHash(filePath: string): Promise<string> {
  const { h64Raw } = await getHasher();
  const fileHandle = await open(filePath, 'r');
  try {
    const fileStat = await fileHandle.stat();
    if (fileStat.size === 0) {
      return '0000000000000000-0';
    }
    const readSize = Math.min(HASH_BYTES, fileStat.size);
    const buffer = new Uint8Array(readSize);
    const { bytesRead } = await fileHandle.read(buffer, 0, readSize, 0);
    const hashInput = bytesRead < readSize ? buffer.subarray(0, bytesRead) : buffer;
    const hash = h64Raw(hashInput);
    return `${hash.toString(16).padStart(16, '0')}-${fileStat.size}`;
  } finally {
    await fileHandle.close();
  }
}
