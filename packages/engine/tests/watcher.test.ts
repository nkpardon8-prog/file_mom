import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Watcher, type WatcherConfig } from '../src/watcher.js';
import type { WatcherEvent } from '../src/types.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'filemom-watch-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeWatcher(overrides: Partial<WatcherConfig> = {}): Watcher {
  return new Watcher({
    watchedFolders: [tempDir],
    debounceMs: 100,
    excludePatterns: [],
    followSymlinks: false,
    includeHidden: false,
    ...overrides,
  });
}

describe('Watcher', () => {
  it('start sets isWatching, stop clears it', async () => {
    const watcher = makeWatcher();
    expect(watcher.isWatching).toBe(false);

    await watcher.start();
    expect(watcher.isWatching).toBe(true);

    await watcher.stop();
    expect(watcher.isWatching).toBe(false);
  });

  it('start throws if already running', async () => {
    const watcher = makeWatcher();
    await watcher.start();

    await expect(watcher.start()).rejects.toThrow('already running');
    await watcher.stop();
  });

  it('stop is idempotent when not started', async () => {
    const watcher = makeWatcher();
    await expect(watcher.stop()).resolves.toBeUndefined();
  });

  it('detects file creation', async () => {
    const watcher = makeWatcher();
    const events: WatcherEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    await watcher.start();
    await sleep(100);

    await writeFile(join(tempDir, 'new.txt'), 'hello');

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'file:created')).toBe(true);
    }, { timeout: 3000 });

    const created = events.find((e) => e.type === 'file:created')!;
    expect(created.type === 'file:created' && created.path).toContain('new.txt');

    await watcher.stop();
  });

  it('detects file modification', async () => {
    const filePath = join(tempDir, 'modify.txt');
    await writeFile(filePath, 'original');

    const watcher = makeWatcher();
    const events: WatcherEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    await watcher.start();
    await sleep(200);

    await writeFile(filePath, 'modified content that is different');

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'file:modified')).toBe(true);
    }, { timeout: 3000 });

    await watcher.stop();
  });

  it('detects file deletion', async () => {
    const filePath = join(tempDir, 'delete-me.txt');
    await writeFile(filePath, 'goodbye');

    const watcher = makeWatcher();
    const events: WatcherEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    await watcher.start();
    await sleep(200);

    await rm(filePath);

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'file:deleted')).toBe(true);
    }, { timeout: 3000 });

    await watcher.stop();
  });

  it('onEvent/offEvent handler registration', async () => {
    const watcher = makeWatcher();
    const events: WatcherEvent[] = [];
    const handler = (e: WatcherEvent) => events.push(e);

    watcher.onEvent(handler);
    await watcher.start();
    await sleep(100);

    await writeFile(join(tempDir, 'first.txt'), 'a');
    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    // Remove handler
    watcher.offEvent(handler);
    const countBefore = events.length;

    await writeFile(join(tempDir, 'second.txt'), 'b');
    await sleep(500);

    // No new events after handler removed
    expect(events.length).toBe(countBefore);

    await watcher.stop();
  });

  it('excludePatterns filters matching files', async () => {
    const watcher = makeWatcher({ excludePatterns: ['**/*.tmp'] });
    const events: WatcherEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    await watcher.start();
    await sleep(100);

    await writeFile(join(tempDir, 'ignored.tmp'), 'temp');
    await writeFile(join(tempDir, 'included.txt'), 'keep');

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'file:created' && e.path.includes('included.txt'))).toBe(true);
    }, { timeout: 3000 });

    // tmp file should not appear
    expect(events.some((e) => e.type === 'file:created' && e.path.includes('ignored.tmp'))).toBe(false);

    await watcher.stop();
  });

  it('hidden files filtered when includeHidden is false', async () => {
    const watcher = makeWatcher({ includeHidden: false });
    const events: WatcherEvent[] = [];
    watcher.onEvent((e) => events.push(e));

    await watcher.start();
    await sleep(100);

    await writeFile(join(tempDir, '.hidden'), 'secret');
    await writeFile(join(tempDir, 'visible.txt'), 'public');

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'file:created' && e.path.includes('visible.txt'))).toBe(true);
    }, { timeout: 3000 });

    expect(events.some((e) => e.type === 'file:created' && e.path.includes('.hidden'))).toBe(false);

    await watcher.stop();
  });

  it('handler errors do not crash the watcher', async () => {
    const watcher = makeWatcher();
    const events: WatcherEvent[] = [];

    // Bad handler that throws
    watcher.onEvent(() => { throw new Error('bad handler'); });
    // Good handler
    watcher.onEvent((e) => events.push(e));

    await watcher.start();
    await sleep(100);

    await writeFile(join(tempDir, 'test.txt'), 'content');

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'file:created')).toBe(true);
    }, { timeout: 3000 });

    await watcher.stop();
  });
});
