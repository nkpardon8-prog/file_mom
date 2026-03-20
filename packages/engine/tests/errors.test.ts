import { describe, it, expect } from 'vitest';
import {
  FileMomError,
  ScanError,
  ExtractionError,
  AIError,
  ExecutionError,
  ValidationError,
  WatcherError,
  EmbeddingError,
} from '../src/errors.js';

describe('FileMomError', () => {
  it('stores code, message, and recoverable flag', () => {
    const err = new FileMomError('test message', 'TEST_CODE', true, { key: 'val' });
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.recoverable).toBe(true);
    expect(err.details).toEqual({ key: 'val' });
    expect(err.name).toBe('FileMomError');
  });

  it('defaults recoverable to false', () => {
    const err = new FileMomError('msg', 'CODE');
    expect(err.recoverable).toBe(false);
  });

  it('is an instance of Error', () => {
    const err = new FileMomError('msg', 'CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FileMomError);
  });
});

describe('ScanError', () => {
  it('formats message from path and sets recoverable=true', () => {
    const cause = new Error('permission denied');
    const err = new ScanError('/some/path', cause);
    expect(err.message).toBe('Failed to scan: /some/path');
    expect(err.code).toBe('SCAN_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.details).toEqual({ path: '/some/path', cause: 'permission denied' });
    expect(err).toBeInstanceOf(FileMomError);
  });
});

describe('ExtractionError', () => {
  it('formats message from path and sets recoverable=true', () => {
    const cause = new Error('corrupt file');
    const err = new ExtractionError('/bad/file.pdf', cause);
    expect(err.message).toBe('Failed to extract metadata: /bad/file.pdf');
    expect(err.code).toBe('EXTRACTION_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.details).toEqual({ path: '/bad/file.pdf', cause: 'corrupt file' });
  });
});

describe('AIError', () => {
  it('stores message and optional cause', () => {
    const err = new AIError('rate limited', new Error('429'));
    expect(err.code).toBe('AI_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.details?.cause).toBe('429');
  });

  it('handles missing cause gracefully', () => {
    const err = new AIError('timeout');
    expect(err.details?.cause).toBeUndefined();
  });
});

describe('ExecutionError', () => {
  it('stores actionId and is not recoverable', () => {
    const err = new ExecutionError('action-123', 'file locked', new Error('EBUSY'));
    expect(err.message).toBe('file locked');
    expect(err.code).toBe('EXECUTION_ERROR');
    expect(err.recoverable).toBe(false);
    expect(err.details).toEqual({ actionId: 'action-123', cause: 'EBUSY' });
  });
});

describe('ValidationError', () => {
  it('stores issues array and is not recoverable', () => {
    const err = new ValidationError('invalid plan', ['missing source', 'bad confidence']);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.recoverable).toBe(false);
    expect(err.details?.issues).toEqual(['missing source', 'bad confidence']);
  });
});

describe('WatcherError', () => {
  it('stores message and optional cause, recoverable=true', () => {
    const err = new WatcherError('folder removed', new Error('ENOENT'));
    expect(err.message).toBe('folder removed');
    expect(err.code).toBe('WATCHER_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.details?.cause).toBe('ENOENT');
    expect(err).toBeInstanceOf(FileMomError);
  });

  it('handles missing cause gracefully', () => {
    const err = new WatcherError('watcher already running');
    expect(err.details?.cause).toBeUndefined();
  });
});

describe('Error hierarchy', () => {
  it('all subclasses are instanceof FileMomError and Error', () => {
    const errors = [
      new ScanError('/p', new Error('e')),
      new ExtractionError('/p', new Error('e')),
      new AIError('msg'),
      new ExecutionError('id', 'msg'),
      new ValidationError('msg', []),
      new WatcherError('msg'),
      new EmbeddingError('msg'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(FileMomError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('all subclasses have name FileMomError', () => {
    const errors = [
      new ScanError('/p', new Error('e')),
      new ExtractionError('/p', new Error('e')),
      new AIError('msg'),
      new ExecutionError('id', 'msg'),
      new ValidationError('msg', []),
      new WatcherError('msg'),
      new EmbeddingError('msg'),
    ];
    for (const err of errors) {
      expect(err.name).toBe('FileMomError');
    }
  });

  it('cause chain propagation in details', () => {
    const root = new Error('root cause');
    const scan = new ScanError('/test/path', root);
    expect(scan.details?.cause).toBe('root cause');

    const extract = new ExtractionError('/test/file.pdf', root);
    expect(extract.details?.cause).toBe('root cause');
  });
});
