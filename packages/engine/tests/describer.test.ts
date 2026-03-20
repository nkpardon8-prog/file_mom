import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ============================================================
// Mocks
// ============================================================

const mockCreate = vi.fn();
vi.mock('openai', () => {
  class MockAPIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }
  class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(_opts: unknown) {}
    static APIError = MockAPIError;
  }
  return { default: MockOpenAI };
});

vi.mock('sharp', () => ({
  default: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-jpeg-data')),
  }),
}));

import { Describer, type DescriptionFields } from '../src/describer.js';
import type { FileRecord } from '../src/types.js';

// ============================================================
// Helpers
// ============================================================

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'filemom-describer-'));
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const defaultConfig = {
  apiKey: 'test-api-key',
  visionModel: 'qwen/qwen-2.5-vl-7b-instruct',
  textModel: 'google/gemini-2.5-flash',
  concurrency: 5,
  retryAttempts: 0,
  retryDelayMs: 100,
  maxImageDimension: 1024,
};

function makeRecord(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 1,
    path: join(tempDir, 'test.txt'),
    name: 'test.txt',
    extension: 'txt',
    size: 1234,
    mtime: Date.now(),
    ctime: Date.now(),
    quickHash: 'abc123def456-1234',
    extractedText: null,
    exifJson: null,
    detectedMimeType: null,
    indexedAt: Date.now(),
    embeddingId: null,
    visionDescription: null,
    visionCategory: null,
    visionTags: null,
    enrichedAt: null,
    aiDescription: null,
    aiCategory: null,
    aiSubcategory: null,
    aiTags: null,
    aiDateContext: null,
    aiSource: null,
    aiContentType: null,
    aiConfidence: null,
    aiSensitive: null,
    aiSensitiveType: null,
    aiDetails: null,
    aiDescribedAt: null,
    aiDescriptionModel: null,
    ...overrides,
  };
}

function mockLLMResponse(data: Record<string, unknown>, cost?: number) {
  const response = {
    choices: [{
      message: { content: JSON.stringify(data) },
      index: 0,
      finish_reason: 'stop',
    }],
    usage: cost !== undefined ? { cost } : undefined,
  };
  mockCreate.mockResolvedValueOnce(response);
  return response;
}

const validPhotoResponse = {
  contentType: 'photo',
  description: 'Beach sunset with two people walking along the shore',
  category: 'personal',
  subcategory: 'vacation_photo',
  tags: ['beach', 'sunset', 'vacation', 'ocean'],
  dateContext: 'Summer 2023',
  source: null,
  confidence: 0.95,
  sensitive: false,
  sensitiveType: null,
  details: {
    sceneType: 'outdoor_beach',
    setting: 'Waikiki Beach',
    people: { count: 2, descriptions: ['Two adults walking'] },
    objects: ['surfboard'],
    mood: 'relaxed',
    quality: 'high',
  },
};

const validDocumentResponse = {
  description: 'Invoice from Amazon for USB-C hub purchase',
  category: 'financial',
  subcategory: 'invoice',
  tags: ['amazon', 'electronics', 'invoice', '2024'],
  dateContext: 'Q1 2024',
  source: 'Amazon',
  confidence: 0.92,
  sensitive: true,
  sensitiveType: 'financial',
  details: {
    documentType: 'invoice',
    subject: 'Electronics purchase',
    summary: 'Invoice for a USB-C hub purchased from Amazon.',
    entities: {
      companies: [{ name: 'Amazon', role: 'vendor' }],
      amounts: [{ value: 45.99, currency: 'USD', context: 'total' }],
    },
  },
};

const validSpreadsheetResponse = {
  description: 'Monthly expense tracker for personal finances',
  category: 'financial',
  subcategory: 'tracker',
  tags: ['expenses', 'budget', 'monthly', '2024'],
  dateContext: '2024',
  source: null,
  confidence: 0.88,
  sensitive: true,
  sensitiveType: 'financial',
  details: {
    dataType: 'expense_tracker',
    subject: 'Personal monthly expenses',
    columns: ['Date', 'Description', 'Amount', 'Category'],
    rowCount: 156,
    sheetNames: ['Expenses'],
    keyInsights: ['Rent is largest expense'],
  },
};

// ============================================================
// Content Type Detection
// ============================================================

describe('detectContentType', () => {
  it('routes all extension groups correctly', () => {
    const describer = new Describer(defaultConfig);

    // Images
    expect(describer.detectContentType(makeRecord({ path: '/test/photo.jpg', extension: 'jpg' }))).toBe('photo');
    expect(describer.detectContentType(makeRecord({ path: '/test/img.png', extension: 'png' }))).toBe('photo');
    expect(describer.detectContentType(makeRecord({ path: '/test/img.heic', extension: 'heic' }))).toBe('photo');

    // Documents
    expect(describer.detectContentType(makeRecord({ path: '/test/doc.pdf', extension: 'pdf' }))).toBe('document');
    expect(describer.detectContentType(makeRecord({ path: '/test/doc.docx', extension: 'docx' }))).toBe('document');
    expect(describer.detectContentType(makeRecord({ path: '/test/doc.txt', extension: 'txt' }))).toBe('document');

    // Spreadsheets
    expect(describer.detectContentType(makeRecord({ path: '/test/data.xlsx', extension: 'xlsx' }))).toBe('spreadsheet');
    expect(describer.detectContentType(makeRecord({ path: '/test/data.csv', extension: 'csv' }))).toBe('spreadsheet');
    expect(describer.detectContentType(makeRecord({ path: '/test/data.ods', extension: 'ods' }))).toBe('spreadsheet');

    // Audio
    expect(describer.detectContentType(makeRecord({ path: '/test/song.mp3', extension: 'mp3' }))).toBe('audio');
    expect(describer.detectContentType(makeRecord({ path: '/test/song.flac', extension: 'flac' }))).toBe('audio');

    // Unknown
    expect(describer.detectContentType(makeRecord({ path: '/test/data.xyz', extension: 'xyz' }))).toBe('other');
  });

  it('falls back to MIME type when extension is unknown', () => {
    const describer = new Describer(defaultConfig);

    expect(describer.detectContentType(makeRecord({
      path: '/test/data.bin',
      extension: 'bin',
      detectedMimeType: 'image/jpeg',
    }))).toBe('photo');

    expect(describer.detectContentType(makeRecord({
      path: '/test/data.bin',
      extension: 'bin',
      detectedMimeType: 'application/pdf',
    }))).toBe('document');

    expect(describer.detectContentType(makeRecord({
      path: '/test/data.bin',
      extension: 'bin',
      detectedMimeType: 'audio/mpeg',
    }))).toBe('audio');
  });
});

// ============================================================
// Image Description
// ============================================================

describe('Image description', () => {
  it('describes a photo via VLM with EXIF context', async () => {
    const filePath = join(tempDir, 'beach.jpg');
    await writeFile(filePath, 'fake jpeg data');

    mockLLMResponse(validPhotoResponse);

    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: filePath,
      name: 'beach.jpg',
      extension: 'jpg',
      exifJson: JSON.stringify({
        dateTaken: '2023:08:15 14:32:18',
        camera: 'Apple iPhone 14 Pro',
        gps: { latitude: 21.3069, longitude: -157.8583 },
      }),
    }));

    expect(result.aiDescription).toBe('Beach sunset with two people walking along the shore');
    expect(result.aiCategory).toBe('personal');
    expect(result.aiContentType).toBe('photo');
    expect(result.aiConfidence).toBe(0.95);
    expect(result.aiDescriptionModel).toBe('qwen/qwen-2.5-vl-7b-instruct');
    expect(JSON.parse(result.aiTags)).toEqual(['beach', 'sunset', 'vacation', 'ocean']);
    expect(result.aiDetails).not.toBeNull();
    expect(JSON.parse(result.aiDetails!).sceneType).toBe('outdoor_beach');

    // Verify VLM was called with image_url
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('qwen/qwen-2.5-vl-7b-instruct');
    const userMsg = callArgs.messages[1];
    expect(userMsg.content).toBeInstanceOf(Array);
    expect(userMsg.content[1].type).toBe('image_url');

    // Verify EXIF context was included
    const textContent = userMsg.content[0].text;
    expect(textContent).toContain('Date taken:');
    expect(textContent).toContain('Camera:');
    expect(textContent).toContain('GPS:');
  });

  it('classifies screenshot via VLM contentType response', async () => {
    const filePath = join(tempDir, 'screen.png');
    await writeFile(filePath, 'fake png data');

    mockLLMResponse({
      ...validPhotoResponse,
      contentType: 'screenshot',
      description: 'Slack conversation about project deadline',
      category: 'work',
      subcategory: 'conversation',
      tags: ['slack', 'chat', 'project'],
      details: { application: 'Slack', platform: 'macOS', purpose: 'conversation' },
    });

    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: filePath,
      name: 'screen.png',
      extension: 'png',
    }));

    expect(result.aiContentType).toBe('screenshot');
    expect(result.aiCategory).toBe('work');
  });

  it('classifies scan via VLM contentType response', async () => {
    const filePath = join(tempDir, 'receipt.jpg');
    await writeFile(filePath, 'fake jpeg data');

    mockLLMResponse({
      ...validPhotoResponse,
      contentType: 'scan',
      description: 'Scanned grocery receipt from Whole Foods',
      category: 'financial',
      subcategory: 'receipt',
      tags: ['receipt', 'groceries'],
      details: { documentType: 'receipt', isHandwritten: false, quality: 'clear' },
    });

    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: filePath,
      name: 'receipt.jpg',
      extension: 'jpg',
    }));

    expect(result.aiContentType).toBe('scan');
    expect(result.aiCategory).toBe('financial');
  });
});

// ============================================================
// Document Description
// ============================================================

describe('Document description', () => {
  it('describes document via text LLM', async () => {
    const filePath = join(tempDir, 'invoice.pdf');
    await writeFile(filePath, 'fake pdf');

    mockLLMResponse(validDocumentResponse);

    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: filePath,
      name: 'invoice.pdf',
      extension: 'pdf',
      extractedText: 'Amazon.com Invoice #INV-2024-001 USB-C Hub $45.99 Date: 2024-01-15',
    }));

    expect(result.aiDescription).toBe('Invoice from Amazon for USB-C hub purchase');
    expect(result.aiCategory).toBe('financial');
    expect(result.aiSubcategory).toBe('invoice');
    expect(result.aiContentType).toBe('document');
    expect(result.aiSensitive).toBe(true);
    expect(result.aiSensitiveType).toBe('financial');
    expect(result.aiSource).toBe('Amazon');
    expect(result.aiDescriptionModel).toBe('google/gemini-2.5-flash');

    // Verify text LLM was called (not VLM)
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('google/gemini-2.5-flash');
    expect(typeof callArgs.messages[1].content).toBe('string');
    expect(callArgs.messages[1].content).toContain('FILENAME: invoice.pdf');
    expect(callArgs.messages[1].content).toContain('USB-C Hub');
  });

  it('returns fallback for empty document', async () => {
    const filePath = join(tempDir, 'empty.pdf');
    await writeFile(filePath, 'fake pdf');

    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: filePath,
      name: 'empty.pdf',
      extension: 'pdf',
      extractedText: null,
    }));

    expect(result.aiDescription).toBe('Document file: empty.pdf');
    expect(result.aiConfidence).toBe(0.1);
    expect(result.aiDescriptionModel).toBe('none');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ============================================================
// Spreadsheet Description
// ============================================================

describe('Spreadsheet description', () => {
  it('describes spreadsheet via text LLM', async () => {
    const filePath = join(tempDir, 'expenses.xlsx');
    await writeFile(filePath, 'fake xlsx');

    mockLLMResponse(validSpreadsheetResponse);

    const extractedText = 'Sheet: Expenses (156 rows)\nColumns: Date, Description, Amount, Category\nSample data:\n  2024-01-03 | Whole Foods | 67.42 | Groceries';

    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: filePath,
      name: 'expenses.xlsx',
      extension: 'xlsx',
      extractedText,
    }));

    expect(result.aiDescription).toBe('Monthly expense tracker for personal finances');
    expect(result.aiCategory).toBe('financial');
    expect(result.aiContentType).toBe('spreadsheet');
    expect(result.aiSensitive).toBe(true);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[1].content).toContain('expenses.xlsx');
    expect(callArgs.messages[1].content).toContain('Expenses');
  });
});

// ============================================================
// Audio Description
// ============================================================

describe('Audio description', () => {
  it('describes audio from metadata without API call', () => {
    const describer = new Describer(defaultConfig);
    const result = describer.describeFile(makeRecord({
      path: join(tempDir, 'song.mp3'),
      name: 'song.mp3',
      extension: 'mp3',
      extractedText: 'Artist: Radiohead | Album: OK Computer | Title: Paranoid Android | Year: 1997 | Genre: Alternative Rock | Duration: 6:23',
    })) as unknown as DescriptionFields; // synchronous path returns directly via Promise

    // Since _describeAudio returns synchronously wrapped in async, await it
    return (describer.describeFile(makeRecord({
      path: join(tempDir, 'song.mp3'),
      name: 'song.mp3',
      extension: 'mp3',
      extractedText: 'Artist: Radiohead | Album: OK Computer | Title: Paranoid Android | Year: 1997 | Genre: Alternative Rock | Duration: 6:23',
    }))).then((result) => {
      expect(result.aiDescription).toContain('Paranoid Android');
      expect(result.aiDescription).toContain('Radiohead');
      expect(result.aiCategory).toBe('media');
      expect(result.aiContentType).toBe('audio');
      expect(result.aiConfidence).toBe(0.9);
      expect(result.aiDescriptionModel).toBe('metadata');
      expect(result.aiSource).toBe('Radiohead');
      expect(result.aiDateContext).toBe('1997');

      const details = JSON.parse(result.aiDetails!);
      expect(details.artist).toBe('Radiohead');
      expect(details.album).toBe('OK Computer');
      expect(details.title).toBe('Paranoid Android');
      expect(details.year).toBe(1997);
      expect(details.isVoiceRecording).toBe(false);

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  it('returns low-confidence fallback for audio with no metadata', async () => {
    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: join(tempDir, 'unknown.wav'),
      name: 'unknown.wav',
      extension: 'wav',
      extractedText: null,
    }));

    expect(result.aiDescription).toBe('Audio file: unknown.wav');
    expect(result.aiConfidence).toBe(0.3);
    expect(result.aiCategory).toBe('media');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ============================================================
// Error Handling & Edge Cases
// ============================================================

describe('Error handling', () => {
  it('throws AIError when LLM returns invalid JSON', async () => {
    const filePath = join(tempDir, 'doc.pdf');
    await writeFile(filePath, 'fake pdf');

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not valid json at all' }, index: 0, finish_reason: 'stop' }],
    });

    const describer = new Describer(defaultConfig);

    await expect(describer.describeFile(makeRecord({
      path: filePath,
      name: 'doc.pdf',
      extension: 'pdf',
      extractedText: 'Some document text',
    }))).rejects.toThrow('Failed to parse description JSON');
  });

  it('strips markdown code fences from LLM response', async () => {
    const filePath = join(tempDir, 'doc.pdf');
    await writeFile(filePath, 'fake pdf');

    const wrappedJson = '```json\n' + JSON.stringify(validDocumentResponse) + '\n```';
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: wrappedJson }, index: 0, finish_reason: 'stop' }],
    });

    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: filePath,
      name: 'doc.pdf',
      extension: 'pdf',
      extractedText: 'Some document text',
    }));

    expect(result.aiDescription).toBe('Invoice from Amazon for USB-C hub purchase');
  });

  it('throws AIError when schema validation fails', async () => {
    const filePath = join(tempDir, 'doc.pdf');
    await writeFile(filePath, 'fake pdf');

    // Missing required fields
    mockLLMResponse({ description: 'test' });

    const describer = new Describer(defaultConfig);
    await expect(describer.describeFile(makeRecord({
      path: filePath,
      name: 'doc.pdf',
      extension: 'pdf',
      extractedText: 'Some text',
    }))).rejects.toThrow('Description response failed validation');
  });
});

// ============================================================
// Batch Processing
// ============================================================

describe('Batch processing', () => {
  it('calls onProgress and returns Map of results', async () => {
    const files: FileRecord[] = [];
    for (let i = 0; i < 3; i++) {
      const filePath = join(tempDir, `doc${i}.pdf`);
      await writeFile(filePath, `fake pdf ${i}`);
      mockLLMResponse({ ...validDocumentResponse, description: `Document ${i}` });
      files.push(makeRecord({
        path: filePath,
        name: `doc${i}.pdf`,
        extension: 'pdf',
        extractedText: `Content for doc ${i}`,
      }));
    }

    const progress: Array<[number, number]> = [];
    const describer = new Describer(defaultConfig);
    const results = await describer.describeBatch(files, (done, total) => {
      progress.push([done, total]);
    });

    expect(results.size).toBe(3);
    expect(progress).toHaveLength(3);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
    for (let i = 0; i < 3; i++) {
      expect(results.get(files[i].path)?.aiDescription).toBe(`Document ${i}`);
    }
  });

  it('skips failed files in batch without stopping', async () => {
    // First file will fail, second will succeed
    const file1Path = join(tempDir, 'fail.pdf');
    const file2Path = join(tempDir, 'ok.pdf');
    await writeFile(file1Path, 'fake');
    await writeFile(file2Path, 'fake');

    // First call returns invalid data, second returns valid
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'invalid' }, index: 0, finish_reason: 'stop' }],
    });
    mockLLMResponse(validDocumentResponse);

    const describer = new Describer(defaultConfig);
    const results = await describer.describeBatch([
      makeRecord({ path: file1Path, name: 'fail.pdf', extension: 'pdf', extractedText: 'text' }),
      makeRecord({ path: file2Path, name: 'ok.pdf', extension: 'pdf', extractedText: 'text' }),
    ]);

    expect(results.size).toBe(1);
    expect(results.has(file2Path)).toBe(true);
    expect(results.has(file1Path)).toBe(false);
  });
});

// ============================================================
// Cost Tracking
// ============================================================

describe('Cost tracking', () => {
  it('accumulates cost across multiple calls', async () => {
    const describer = new Describer(defaultConfig);

    for (let i = 0; i < 3; i++) {
      const filePath = join(tempDir, `doc${i}.pdf`);
      await writeFile(filePath, `fake pdf ${i}`);
      mockLLMResponse(validDocumentResponse, 0.001);
      await describer.describeFile(makeRecord({
        path: filePath,
        name: `doc${i}.pdf`,
        extension: 'pdf',
        extractedText: 'Some text',
      }));
    }

    expect(describer.getCost()).toBeCloseTo(0.003, 5);
  });
});

// ============================================================
// Generic / Unknown Extension
// ============================================================

describe('Generic files', () => {
  it('returns other contentType for unknown extensions', async () => {
    const describer = new Describer(defaultConfig);
    const result = await describer.describeFile(makeRecord({
      path: join(tempDir, 'data.xyz'),
      name: 'data.xyz',
      extension: 'xyz',
    }));

    expect(result.aiContentType).toBe('other');
    expect(result.aiCategory).toBe('reference');
    expect(result.aiConfidence).toBe(0.1);
    expect(result.aiDescription).toBe('Other file: data.xyz');
    expect(result.aiDescriptionModel).toBe('none');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
