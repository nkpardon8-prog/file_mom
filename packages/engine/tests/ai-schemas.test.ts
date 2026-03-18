import { describe, it, expect } from 'vitest';
import { ActionSchema, ActionPlanSchema, SYSTEM_PROMPT, buildUserPrompt } from '../src/ai.js';
import type { FileIndexEntry } from '../src/types.js';

const VALID_ACTION = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  type: 'move_file' as const,
  source: '/Users/test/Downloads/photo.jpg',
  destination: '/Users/test/Pictures/photo.jpg',
  reason: 'Move photo to Pictures folder',
  confidence: 0.95,
};

const VALID_PLAN = {
  intent: 'Organize photos into Pictures folder',
  actions: [VALID_ACTION],
  needsReview: [],
  summary: {
    filesAffected: 1,
    foldersCreated: 0,
    totalSizeBytes: 4096,
  },
  warnings: [],
};

describe('ActionSchema', () => {
  it('accepts a valid action', () => {
    expect(() => ActionSchema.parse(VALID_ACTION)).not.toThrow();
  });

  it('rejects invalid action type', () => {
    expect(() => ActionSchema.parse({ ...VALID_ACTION, type: 'delete_file' })).toThrow();
  });

  it('rejects confidence above 1', () => {
    expect(() => ActionSchema.parse({ ...VALID_ACTION, confidence: 1.5 })).toThrow();
  });

  it('rejects confidence below 0', () => {
    expect(() => ActionSchema.parse({ ...VALID_ACTION, confidence: -0.1 })).toThrow();
  });

  it('rejects non-UUID id', () => {
    expect(() => ActionSchema.parse({ ...VALID_ACTION, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects empty source path', () => {
    expect(() => ActionSchema.parse({ ...VALID_ACTION, source: '' })).toThrow();
  });

  it('rejects reason longer than 500 chars', () => {
    expect(() => ActionSchema.parse({ ...VALID_ACTION, reason: 'x'.repeat(501) })).toThrow();
  });

  it('accepts all valid action types', () => {
    for (const type of ['move_file', 'rename_file', 'create_folder', 'copy_file']) {
      expect(() => ActionSchema.parse({ ...VALID_ACTION, type })).not.toThrow();
    }
  });
});

describe('ActionPlanSchema', () => {
  it('accepts a valid plan', () => {
    const result = ActionPlanSchema.parse(VALID_PLAN);
    expect(result.intent).toBe(VALID_PLAN.intent);
    expect(result.actions).toHaveLength(1);
  });

  it('accepts a plan with no actions', () => {
    const empty = { ...VALID_PLAN, actions: [], summary: { ...VALID_PLAN.summary, filesAffected: 0 } };
    expect(() => ActionPlanSchema.parse(empty)).not.toThrow();
  });

  it('rejects missing intent', () => {
    const { intent: _, ...noIntent } = VALID_PLAN;
    expect(() => ActionPlanSchema.parse(noIntent)).toThrow();
  });

  it('rejects negative summary values', () => {
    expect(() =>
      ActionPlanSchema.parse({
        ...VALID_PLAN,
        summary: { filesAffected: -1, foldersCreated: 0, totalSizeBytes: 0 },
      }),
    ).toThrow();
  });

  it('rejects more than 20 warnings', () => {
    const tooManyWarnings = { ...VALID_PLAN, warnings: Array.from({ length: 21 }, (_, i) => `warn ${i}`) };
    expect(() => ActionPlanSchema.parse(tooManyWarnings)).toThrow();
  });

  it('rejects more than 1000 actions', () => {
    const tooMany = {
      ...VALID_PLAN,
      actions: Array.from({ length: 1001 }, () => VALID_ACTION),
    };
    expect(() => ActionPlanSchema.parse(tooMany)).toThrow();
  });
});

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains confidence guidelines', () => {
    expect(SYSTEM_PROMPT).toContain('CONFIDENCE GUIDELINES');
  });

  it('instructs JSON output', () => {
    expect(SYSTEM_PROMPT).toContain('valid JSON');
  });
});

describe('buildUserPrompt', () => {
  const files: FileIndexEntry[] = [
    {
      id: 1,
      path: '/Users/test/photo.jpg',
      name: 'photo.jpg',
      extension: 'jpg',
      size: 4096,
      modifiedDate: '2024-03-15',
      summary: 'Beach photo',
    },
  ];

  it('includes the user command', () => {
    const result = buildUserPrompt('organize photos', files);
    expect(result).toContain('USER COMMAND: "organize photos"');
  });

  it('includes the file count', () => {
    const result = buildUserPrompt('organize photos', files);
    expect(result).toContain('FILE INDEX (1 files)');
  });

  it('includes file data as JSON', () => {
    const result = buildUserPrompt('organize photos', files);
    expect(result).toContain('"name": "photo.jpg"');
    expect(result).toContain('"summary": "Beach photo"');
  });

  it('includes recent folders when provided', () => {
    const result = buildUserPrompt('organize', files, {
      recentFolders: ['/Users/test/Pictures', '/Users/test/Documents'],
    });
    expect(result).toContain('RECENTLY USED FOLDERS');
    expect(result).toContain('- /Users/test/Pictures');
    expect(result).toContain('- /Users/test/Documents');
  });

  it('omits recent folders section when not provided', () => {
    const result = buildUserPrompt('organize', files);
    expect(result).not.toContain('RECENTLY USED FOLDERS');
  });

  it('omits recent folders section when array is empty', () => {
    const result = buildUserPrompt('organize', files, { recentFolders: [] });
    expect(result).not.toContain('RECENTLY USED FOLDERS');
  });

  it('ends with instruction to return JSON', () => {
    const result = buildUserPrompt('organize', files);
    expect(result).toContain('Return a JSON action plan.');
  });
});
