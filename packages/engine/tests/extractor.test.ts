import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { quickHash } from '../src/utils/hash.js';

// Mock external extraction libraries
vi.mock('exifr', () => ({
  default: {
    parse: vi.fn(),
  },
}));

const mockExtractPdfText = vi.fn();
vi.mock('unpdf', () => ({
  extractText: (...args: unknown[]) => mockExtractPdfText(...args),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

vi.mock('music-metadata', () => ({
  parseFile: vi.fn(),
}));

vi.mock('file-type', () => ({
  fileTypeFromFile: vi.fn().mockResolvedValue(null),
}));

const mockReadFile = vi.fn();
const mockSheetToJson = vi.fn();
const mockDecodeRange = vi.fn();
vi.mock('xlsx', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  utils: {
    sheet_to_json: (...args: unknown[]) => mockSheetToJson(...args),
    decode_range: (...args: unknown[]) => mockDecodeRange(...args),
  },
}));

// Import after mocks are set up
import exifr from 'exifr';
import mammoth from 'mammoth';
import { parseFile } from 'music-metadata';
import { fileTypeFromFile } from 'file-type';
import { Extractor } from '../src/extractor.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'filemom-extract-'));
  vi.clearAllMocks();
  // Default: file-type returns null (unknown), so extension-based routing is used
  vi.mocked(fileTypeFromFile).mockResolvedValue(null);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const defaultConfig = {
  maxTextLength: 10000,
  timeoutMs: 5000,
  skipExtensions: ['exe', 'dll'],
};

// ============================================================
// quickHash tests (real files, no mocks)
// ============================================================

describe('quickHash', () => {
  it('returns consistent format (hex-size)', async () => {
    const filePath = join(tempDir, 'test.txt');
    await writeFile(filePath, 'hello world');

    const hash = await quickHash(filePath);
    expect(hash).toMatch(/^[0-9a-f]{16}-\d+$/);
  });

  it('is deterministic', async () => {
    const filePath = join(tempDir, 'test.txt');
    await writeFile(filePath, 'same content');

    const hash1 = await quickHash(filePath);
    const hash2 = await quickHash(filePath);
    expect(hash1).toBe(hash2);
  });

  it('changes when content changes', async () => {
    const filePath = join(tempDir, 'test.txt');

    await writeFile(filePath, 'content A');
    const hash1 = await quickHash(filePath);

    await writeFile(filePath, 'content B');
    const hash2 = await quickHash(filePath);

    expect(hash1).not.toBe(hash2);
  });

  it('handles empty files', async () => {
    const filePath = join(tempDir, 'empty.txt');
    await writeFile(filePath, '');

    const hash = await quickHash(filePath);
    expect(hash).toBe('0000000000000000-0');
  });

  it('includes file size in hash', async () => {
    const filePath = join(tempDir, 'sized.txt');
    await writeFile(filePath, 'hello'); // 5 bytes

    const hash = await quickHash(filePath);
    expect(hash.endsWith('-5')).toBe(true);
  });

  it('handles file exactly 4096 bytes', async () => {
    const filePath = join(tempDir, 'exact4k.txt');
    await writeFile(filePath, 'x'.repeat(4096));

    const hash = await quickHash(filePath);
    expect(hash).toMatch(/^[0-9a-f]{16}-4096$/);
  });

  it('files > 4KB: only first 4KB determines hash', async () => {
    const prefix = 'A'.repeat(4096);
    const file1 = join(tempDir, 'same_prefix1.bin');
    const file2 = join(tempDir, 'same_prefix2.bin');
    // Same first 4KB, different tails, same total size
    await writeFile(file1, prefix + 'B'.repeat(4096));
    await writeFile(file2, prefix + 'C'.repeat(4096));

    const hash1 = await quickHash(file1);
    const hash2 = await quickHash(file2);
    // Same hex part (first 4KB identical), same size
    expect(hash1).toBe(hash2);
  });

  it('handles binary content', async () => {
    const filePath = join(tempDir, 'binary.bin');
    const buf = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) buf[i] = i;
    await writeFile(filePath, buf);

    const hash = await quickHash(filePath);
    expect(hash).toMatch(/^[0-9a-f]{16}-256$/);
  });

  it('rejects for non-existent file', async () => {
    await expect(quickHash('/nonexistent/file.txt')).rejects.toThrow();
  });

  it('handles single byte file', async () => {
    const filePath = join(tempDir, 'single.bin');
    await writeFile(filePath, 'a');

    const hash = await quickHash(filePath);
    expect(hash).toMatch(/^[0-9a-f]{16}-1$/);
  });
});

// ============================================================
// Extractor tests (mocked external libraries)
// ============================================================

describe('Extractor', () => {
  it('extracts EXIF from image file', async () => {
    const filePath = join(tempDir, 'photo.jpg');
    await writeFile(filePath, 'fake jpeg data');

    vi.mocked(exifr.parse).mockResolvedValue({
      DateTimeOriginal: '2017:08:15 14:32:18',
      Make: 'Apple',
      Model: 'iPhone 14 Pro',
      LensModel: 'back camera',
      ExifImageWidth: 4032,
      ExifImageHeight: 3024,
      Orientation: 1,
      latitude: 21.3069,
      longitude: -157.8583,
      GPSAltitude: 10,
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.exif).not.toBeNull();
    expect(result.exif!.dateTaken).toBe('2017:08:15 14:32:18');
    expect(result.exif!.camera).toBe('Apple iPhone 14 Pro');
    expect(result.exif!.lens).toBe('back camera');
    expect(result.exif!.dimensions).toEqual({ width: 4032, height: 3024 });
    expect(result.exif!.gps).toEqual({ latitude: 21.3069, longitude: -157.8583, altitude: 10 });
    expect(result.exif!.orientation).toBe(1);
    expect(result.extractionError).toBeNull();
    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
  });

  it('returns null exif when no metadata exists', async () => {
    const filePath = join(tempDir, 'screenshot.png');
    await writeFile(filePath, 'fake png data');

    vi.mocked(exifr.parse).mockResolvedValue(null);

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.exif).toBeNull();
    expect(result.extractionError).toBeNull();
    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
  });

  it('extracts text from PDF', async () => {
    const filePath = join(tempDir, 'document.pdf');
    await writeFile(filePath, 'fake pdf data');

    mockExtractPdfText.mockResolvedValue({
      text: 'Quarterly Report Q4 2023. Revenue increased 15%.',
      totalPages: 1,
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBe('Quarterly Report Q4 2023. Revenue increased 15%.');
    expect(result.exif).toBeNull();
    expect(result.extractionError).toBeNull();
  });

  it('truncates PDF text to maxTextLength', async () => {
    const filePath = join(tempDir, 'long.pdf');
    await writeFile(filePath, 'fake pdf');

    const longText = 'A'.repeat(50000);
    mockExtractPdfText.mockResolvedValue({ text: longText, totalPages: 1 });

    const extractor = new Extractor({ ...defaultConfig, maxTextLength: 100 });
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toHaveLength(100);
  });

  it('extracts text from DOCX', async () => {
    const filePath = join(tempDir, 'report.docx');
    await writeFile(filePath, 'fake docx data');

    vi.mocked(mammoth.extractRawText).mockResolvedValue({
      value: 'Meeting notes from Tuesday.',
      messages: [],
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBe('Meeting notes from Tuesday.');
    expect(result.extractionError).toBeNull();
  });

  it('skips files with skipExtensions but still computes hash', async () => {
    const filePath = join(tempDir, 'malware.exe');
    await writeFile(filePath, 'binary data');

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractionError).toBe('Skipped extension');
    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-\d+$/);
    expect(result.extractedText).toBeNull();
    expect(result.detectedMimeType).toBeNull();
  });

  it('returns hash for unknown extensions', async () => {
    const filePath = join(tempDir, 'data.xyz');
    await writeFile(filePath, 'unknown format');

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
    expect(result.extractedText).toBeNull();
    expect(result.exif).toBeNull();
    expect(result.extractionError).toBeNull();
  });

  it('handles extraction timeout', async () => {
    const filePath = join(tempDir, 'slow.pdf');
    await writeFile(filePath, 'fake pdf');

    // Mock that never resolves
    mockExtractPdfText.mockReturnValue(new Promise(() => {}));

    const extractor = new Extractor({ ...defaultConfig, timeoutMs: 100 });
    const result = await extractor.extract(filePath);

    expect(result.extractionError).toContain('timed out');
  });

  it('handles corrupted files gracefully', async () => {
    const filePath = join(tempDir, 'corrupt.jpg');
    await writeFile(filePath, 'not really a jpeg');

    vi.mocked(exifr.parse).mockRejectedValue(new Error('Invalid JPEG'));

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    // EXIF extraction failure is not an extraction error — just null exif
    expect(result.exif).toBeNull();
    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
  });

  it('returns null text for PDFs with no text content', async () => {
    const filePath = join(tempDir, 'scanned.pdf');
    await writeFile(filePath, 'fake scanned pdf');

    mockExtractPdfText.mockResolvedValue({ text: '', totalPages: 1 });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBeNull();
    expect(result.extractionError).toBeNull();
  });

  it('truncates DOCX text to maxTextLength', async () => {
    const filePath = join(tempDir, 'long.docx');
    await writeFile(filePath, 'fake docx');

    const longText = 'B'.repeat(50000);
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: longText, messages: [] });

    const extractor = new Extractor({ ...defaultConfig, maxTextLength: 100 });
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toHaveLength(100);
  });

  it('handles image with partial EXIF (camera only, no GPS or dimensions)', async () => {
    const filePath = join(tempDir, 'partial.jpg');
    await writeFile(filePath, 'fake jpeg');

    vi.mocked(exifr.parse).mockResolvedValue({
      Make: 'Canon',
      Model: 'EOS R5',
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.exif).not.toBeNull();
    expect(result.exif!.camera).toBe('Canon EOS R5');
    expect(result.exif!.gps).toBeNull();
    expect(result.exif!.dimensions).toBeNull();
    expect(result.exif!.orientation).toBeNull();
    expect(result.exif!.lens).toBeNull();
    expect(result.exif!.dateTaken).toBeNull();
  });

  it('handles image with dimensions only (no camera, no GPS)', async () => {
    const filePath = join(tempDir, 'dims.png');
    await writeFile(filePath, 'fake png');

    vi.mocked(exifr.parse).mockResolvedValue({
      ExifImageWidth: 1920,
      ExifImageHeight: 1080,
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.exif).not.toBeNull();
    expect(result.exif!.dimensions).toEqual({ width: 1920, height: 1080 });
    expect(result.exif!.camera).toBeNull();
    expect(result.exif!.gps).toBeNull();
  });

  it('handles uppercase extensions (.JPG)', async () => {
    const filePath = join(tempDir, 'PHOTO.JPG');
    await writeFile(filePath, 'fake jpeg');

    vi.mocked(exifr.parse).mockResolvedValue({
      Make: 'Apple',
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    // Extension is lowercased, so .JPG → 'jpg' which is in IMAGE_EXTS
    expect(exifr.parse).toHaveBeenCalled();
    expect(result.exif).not.toBeNull();
  });

  it('handles files with no extension', async () => {
    const filePath = join(tempDir, 'Makefile');
    await writeFile(filePath, 'all: build');

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
    expect(result.extractedText).toBeNull();
    expect(result.exif).toBeNull();
    expect(result.extractionError).toBeNull();
  });

  it('returns null for whitespace-only PDF text', async () => {
    const filePath = join(tempDir, 'whitespace.pdf');
    await writeFile(filePath, 'fake pdf');

    mockExtractPdfText.mockResolvedValue({ text: '   \n  \t  \n  ', totalPages: 1 });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBeNull();
  });

  it('returns null for whitespace-only DOCX text', async () => {
    const filePath = join(tempDir, 'whitespace.docx');
    await writeFile(filePath, 'fake docx');

    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: '   \n\n   ', messages: [] });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBeNull();
  });

  it('handles DOCX extraction failure gracefully', async () => {
    const filePath = join(tempDir, 'corrupt.docx');
    await writeFile(filePath, 'fake docx');

    vi.mocked(mammoth.extractRawText).mockRejectedValue(new Error('Corrupted DOCX'));

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractionError).toContain('Corrupted DOCX');
    // Hash should still be present even when extraction fails
    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
  });

  it('preserves hash when PDF extraction throws', async () => {
    const filePath = join(tempDir, 'bad.pdf');
    await writeFile(filePath, 'corrupt pdf data');

    mockExtractPdfText.mockRejectedValue(new Error('Invalid PDF structure'));

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractionError).toContain('Invalid PDF structure');
    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
    expect(result.quickHash).not.toBe('');
  });

  it('preserves hash when extraction times out', async () => {
    const filePath = join(tempDir, 'timeout.pdf');
    await writeFile(filePath, 'fake pdf for timeout test');

    mockExtractPdfText.mockReturnValue(new Promise(() => {}));

    const extractor = new Extractor({ ...defaultConfig, timeoutMs: 100 });
    const result = await extractor.extract(filePath);

    expect(result.extractionError).toContain('timed out');
    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
    expect(result.quickHash).not.toBe('');
  });

  it('processes all image extension types', async () => {
    const imageExts = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif', 'gif', 'avif'];

    vi.mocked(exifr.parse).mockResolvedValue({
      Make: 'Test',
    });

    const extractor = new Extractor(defaultConfig);

    for (const ext of imageExts) {
      vi.mocked(exifr.parse).mockClear();
      const filePath = join(tempDir, `test.${ext}`);
      await writeFile(filePath, `fake ${ext} data`);

      await extractor.extract(filePath);
      expect(exifr.parse).toHaveBeenCalled();
    }
  });

  it('concurrent extractions do not interfere', async () => {
    const files = Array.from({ length: 5 }, (_, i) => join(tempDir, `concurrent${i}.txt`));
    for (const f of files) {
      await writeFile(f, `content for ${f}`);
    }

    const extractor = new Extractor(defaultConfig);
    const results = await Promise.all(files.map((f) => extractor.extract(f)));

    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
      expect(result.extractionError).toBeNull();
    }
    // Verify hashes are unique (different content)
    const hashes = new Set(results.map((r) => r.quickHash));
    expect(hashes.size).toBe(5);
  });

  it('handles image with fall-through dimensions from ImageWidth/ImageHeight', async () => {
    const filePath = join(tempDir, 'fallback.jpg');
    await writeFile(filePath, 'fake jpeg');

    vi.mocked(exifr.parse).mockResolvedValue({
      ImageWidth: 800,
      ImageHeight: 600,
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.exif).not.toBeNull();
    expect(result.exif!.dimensions).toEqual({ width: 800, height: 600 });
  });
});

// ============================================================
// Audio extraction tests
// ============================================================

describe('Audio extraction', () => {
  it('extracts audio metadata into formatted text', async () => {
    const filePath = join(tempDir, 'song.mp3');
    await writeFile(filePath, 'fake mp3 data');

    vi.mocked(parseFile).mockResolvedValue({
      common: {
        artist: 'Radiohead',
        album: 'OK Computer',
        title: 'Paranoid Android',
        year: 1997,
        genre: ['Alternative Rock'],
      },
      format: {
        duration: 383.5,
      },
    } as any);

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toContain('Artist: Radiohead');
    expect(result.extractedText).toContain('Album: OK Computer');
    expect(result.extractedText).toContain('Title: Paranoid Android');
    expect(result.extractedText).toContain('Year: 1997');
    expect(result.extractedText).toContain('Genre: Alternative Rock');
    expect(result.extractedText).toContain('Duration: 6:23');
    expect(result.exif).toBeNull();
  });

  it('handles audio files with no metadata', async () => {
    const filePath = join(tempDir, 'unknown.wav');
    await writeFile(filePath, 'fake wav data');

    vi.mocked(parseFile).mockResolvedValue({
      common: {},
      format: {},
    } as any);

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBeNull();
  });

  it('handles audio extraction errors gracefully', async () => {
    const filePath = join(tempDir, 'corrupt.mp3');
    await writeFile(filePath, 'not really an mp3');

    vi.mocked(parseFile).mockRejectedValue(new Error('Invalid audio'));

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBeNull();
    // Audio parse failure returns null text, not an extraction error
    expect(result.extractionError).toBeNull();
  });

  it('processes all audio extension types', async () => {
    const audioExts = ['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'wma', 'opus'];

    vi.mocked(parseFile).mockResolvedValue({
      common: { title: 'Test' },
      format: {},
    } as any);

    const extractor = new Extractor(defaultConfig);

    for (const ext of audioExts) {
      vi.mocked(parseFile).mockClear();
      const filePath = join(tempDir, `test.${ext}`);
      await writeFile(filePath, `fake ${ext} data`);

      await extractor.extract(filePath);
      expect(parseFile).toHaveBeenCalled();
    }
  });
});

// ============================================================
// MIME-type detection tests
// ============================================================

// ============================================================
// Spreadsheet extraction tests
// ============================================================

describe('Spreadsheet extraction', () => {
  function setupXlsxMock(sheets: Record<string, { rows: unknown[][]; fullRef?: string }>) {
    const sheetNames = Object.keys(sheets);
    const sheetsObj: Record<string, Record<string, unknown>> = {};
    for (const [name, data] of Object.entries(sheets)) {
      sheetsObj[name] = data.fullRef ? { '!fullref': data.fullRef } : {};
    }

    mockReadFile.mockReturnValue({ SheetNames: sheetNames, Sheets: sheetsObj });
    mockSheetToJson.mockImplementation((_sheet: unknown, _opts?: unknown) => {
      // Find which sheet was passed by matching the object reference
      for (const [name, sheetObj] of Object.entries(sheetsObj)) {
        if (_sheet === sheetObj) return sheets[name].rows;
      }
      return [];
    });
    mockDecodeRange.mockImplementation((ref: string) => {
      // Parse "A1:D156" style refs
      const match = ref.match(/:([A-Z]+)(\d+)$/);
      return { e: { r: match ? parseInt(match[2], 10) - 1 : 0 } };
    });
  }

  it('extracts text from XLSX with 2 sheets', async () => {
    const filePath = join(tempDir, 'report.xlsx');
    await writeFile(filePath, 'fake xlsx');

    setupXlsxMock({
      Expenses: {
        rows: [
          ['Date', 'Description', 'Amount', 'Category'],
          ['2024-01-03', 'Whole Foods', 67.42, 'Groceries'],
          ['2024-01-05', 'Electric Co', 145.0, 'Utilities'],
        ],
        fullRef: 'A1:D156',
      },
      Summary: {
        rows: [
          ['Category', 'Total'],
          ['Groceries', 523.18],
        ],
        fullRef: 'A1:B10',
      },
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toContain('Sheet: Expenses (156 rows)');
    expect(result.extractedText).toContain('Columns: Date, Description, Amount, Category');
    expect(result.extractedText).toContain('Whole Foods');
    expect(result.extractedText).toContain('Sheet: Summary (10 rows)');
    expect(result.extractedText).toContain('Columns: Category, Total');
    expect(result.extractionError).toBeNull();
  });

  it('extracts text from CSV (single sheet)', async () => {
    const filePath = join(tempDir, 'data.csv');
    await writeFile(filePath, 'fake csv');

    setupXlsxMock({
      Sheet1: {
        rows: [
          ['Name', 'Email', 'Role'],
          ['Alice', 'alice@co.com', 'Engineer'],
          ['Bob', 'bob@co.com', 'Designer'],
        ],
      },
    });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toContain('Sheet: Sheet1');
    expect(result.extractedText).toContain('Columns: Name, Email, Role');
    expect(result.extractedText).toContain('Alice');
  });

  it('truncates to maxTextLength', async () => {
    const filePath = join(tempDir, 'big.xlsx');
    await writeFile(filePath, 'fake xlsx');

    const rows: unknown[][] = [['Col1', 'Col2', 'Col3']];
    for (let i = 0; i < 15; i++) {
      rows.push(['A'.repeat(50), 'B'.repeat(50), 'C'.repeat(50)]);
    }
    setupXlsxMock({ Sheet1: { rows } });

    const extractor = new Extractor({ ...defaultConfig, maxTextLength: 100 });
    const result = await extractor.extract(filePath);

    expect(result.extractedText).not.toBeNull();
    expect(result.extractedText!.length).toBeLessThanOrEqual(100);
  });

  it('returns null for empty spreadsheet', async () => {
    const filePath = join(tempDir, 'empty.xlsx');
    await writeFile(filePath, 'fake xlsx');

    setupXlsxMock({ Sheet1: { rows: [] } });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBeNull();
  });

  it('returns null for whitespace-only headers', async () => {
    const filePath = join(tempDir, 'blank.xlsx');
    await writeFile(filePath, 'fake xlsx');

    setupXlsxMock({ Sheet1: { rows: [['', '  ', '']] } });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBeNull();
  });

  it('handles corrupt file gracefully', async () => {
    const filePath = join(tempDir, 'corrupt.xlsx');
    await writeFile(filePath, 'not a real xlsx');

    mockReadFile.mockImplementation(() => { throw new Error('File is corrupt'); });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBeNull();
    expect(result.extractionError).toBeNull();
    expect(result.quickHash).toMatch(/^[0-9a-f]{16}-/);
  });

  it('processes all spreadsheet extensions', async () => {
    const spreadsheetExts = ['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'ods'];

    setupXlsxMock({
      Sheet1: { rows: [['Header'], ['Data']] },
    });

    const extractor = new Extractor(defaultConfig);

    for (const ext of spreadsheetExts) {
      mockReadFile.mockClear();
      setupXlsxMock({ Sheet1: { rows: [['Header'], ['Data']] } });
      const filePath = join(tempDir, `test.${ext}`);
      await writeFile(filePath, `fake ${ext} data`);

      const result = await extractor.extract(filePath);
      expect(mockReadFile).toHaveBeenCalled();
      expect(result.extractedText).toContain('Header');
    }
  });

  it('routes by MIME type for spreadsheet', async () => {
    const filePath = join(tempDir, 'misnamed.dat');
    await writeFile(filePath, 'fake xlsx data');

    vi.mocked(fileTypeFromFile).mockResolvedValue({
      ext: 'xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as any);
    setupXlsxMock({ Sheet1: { rows: [['A'], ['B']] } });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toContain('Sheet: Sheet1');
    expect(result.detectedMimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });
});

describe('MIME-type detection', () => {
  it('routes by MIME type when file-type detects it', async () => {
    const filePath = join(tempDir, 'misnamed.txt');
    await writeFile(filePath, 'fake pdf data');

    // file-type says it's a PDF despite .txt extension
    vi.mocked(fileTypeFromFile).mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' } as any);
    mockExtractPdfText.mockResolvedValue({ text: 'PDF content', totalPages: 1 });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBe('PDF content');
    expect(result.detectedMimeType).toBe('application/pdf');
  });

  it('falls back to extension when file-type returns null', async () => {
    const filePath = join(tempDir, 'document.pdf');
    await writeFile(filePath, 'fake pdf');

    vi.mocked(fileTypeFromFile).mockResolvedValue(null);
    mockExtractPdfText.mockResolvedValue({ text: 'Extension-based', totalPages: 1 });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toBe('Extension-based');
    expect(result.detectedMimeType).toBeNull();
  });

  it('handles file-type errors gracefully', async () => {
    const filePath = join(tempDir, 'photo.jpg');
    await writeFile(filePath, 'fake jpeg');

    vi.mocked(fileTypeFromFile).mockRejectedValue(new Error('Read error'));
    vi.mocked(exifr.parse).mockResolvedValue({ Make: 'Test' });

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    // Falls back to extension-based routing
    expect(result.exif).not.toBeNull();
    expect(result.detectedMimeType).toBeNull();
  });

  it('routes audio by MIME type', async () => {
    const filePath = join(tempDir, 'track.dat');
    await writeFile(filePath, 'fake audio');

    vi.mocked(fileTypeFromFile).mockResolvedValue({ ext: 'mp3', mime: 'audio/mpeg' } as any);
    vi.mocked(parseFile).mockResolvedValue({
      common: { artist: 'Test' },
      format: {},
    } as any);

    const extractor = new Extractor(defaultConfig);
    const result = await extractor.extract(filePath);

    expect(result.extractedText).toContain('Artist: Test');
    expect(result.detectedMimeType).toBe('audio/mpeg');
  });
});
