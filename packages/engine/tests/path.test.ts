import { describe, it, expect } from 'vitest';
import { normalizePath, isWithinFolder } from '../src/utils/path.js';
import { resolve } from 'node:path';

describe('normalizePath', () => {
  it('resolves relative paths to absolute', () => {
    const result = normalizePath('foo/bar');
    expect(result).toBe(resolve('foo/bar'));
    expect(result.startsWith('/')).toBe(true);
  });

  it('normalizes double slashes and dots', () => {
    const result = normalizePath('/foo//bar/../baz');
    expect(result).toBe('/foo/baz');
  });

  it('passes through already-absolute paths', () => {
    expect(normalizePath('/usr/local/bin')).toBe('/usr/local/bin');
  });
});

describe('isWithinFolder', () => {
  it('returns true for a file nested inside the folder', () => {
    expect(isWithinFolder('/home/user/docs/file.txt', '/home/user/docs')).toBe(true);
  });

  it('returns true for deeply nested paths', () => {
    expect(isWithinFolder('/a/b/c/d/e.txt', '/a/b')).toBe(true);
  });

  it('returns false for the folder itself', () => {
    expect(isWithinFolder('/home/user/docs', '/home/user/docs')).toBe(false);
  });

  it('returns false for a sibling path', () => {
    expect(isWithinFolder('/home/user/other/file.txt', '/home/user/docs')).toBe(false);
  });

  it('returns false for a prefix-similar but different folder', () => {
    // /home/user/documents should NOT be within /home/user/doc
    expect(isWithinFolder('/home/user/documents/file.txt', '/home/user/doc')).toBe(false);
  });

  it('returns false for parent path', () => {
    expect(isWithinFolder('/home/user', '/home/user/docs')).toBe(false);
  });
});
