import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import exifr from 'exifr';
import { extractText as extractPdfText } from 'unpdf';
import mammoth from 'mammoth';
import { parseFile } from 'music-metadata';
import { fileTypeFromFile } from 'file-type';
import { quickHash } from './utils/hash.js';
import type { ExtractedMetadata, ExifData } from './types.js';

export interface ExtractorConfig {
  maxTextLength: number;
  timeoutMs: number;
  skipExtensions: string[];
}

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif', 'gif', 'avif',
]);
const PDF_EXTS = new Set(['pdf']);
const DOCX_EXTS = new Set(['docx']);
const AUDIO_EXTS = new Set([
  'mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'wma', 'opus', 'aiff', 'aif',
]);

function mimeCategory(mime: string | undefined): 'image' | 'pdf' | 'docx' | 'audio' | null {
  if (!mime) return null;
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

export class Extractor {
  constructor(private _config: ExtractorConfig) {}

  async extract(filePath: string): Promise<ExtractedMetadata> {
    const ext = extname(filePath).slice(1).toLowerCase();

    if (this._config.skipExtensions.includes(ext)) {
      const hash = await quickHash(filePath);
      return {
        path: filePath,
        quickHash: hash,
        extractedText: null,
        exif: null,
        detectedMimeType: null,
        extractionError: 'Skipped extension',
        extractedAt: Date.now(),
      };
    }

    // Compute hash outside the timeout so it's preserved even if extraction fails
    let hash = '';
    try {
      hash = await quickHash(filePath);
    } catch (error) {
      return {
        path: filePath,
        quickHash: '',
        extractedText: null,
        exif: null,
        detectedMimeType: null,
        extractionError: error instanceof Error ? error.message : String(error),
        extractedAt: Date.now(),
      };
    }

    try {
      return await withTimeout(
        this._extractInternal(filePath, ext, hash),
        this._config.timeoutMs,
        'Extraction',
      );
    } catch (error) {
      return {
        path: filePath,
        quickHash: hash,
        extractedText: null,
        exif: null,
        detectedMimeType: null,
        extractionError: error instanceof Error ? error.message : String(error),
        extractedAt: Date.now(),
      };
    }
  }

  private async _extractInternal(filePath: string, ext: string, hash: string): Promise<ExtractedMetadata> {

    // Detect actual file type via magic bytes
    let detectedMime: string | null = null;
    try {
      const ft = await fileTypeFromFile(filePath);
      detectedMime = ft?.mime ?? null;
    } catch {
      // file-type may fail on very small/empty files — fall through to extension-based
    }

    const base: ExtractedMetadata = {
      path: filePath,
      quickHash: hash,
      extractedText: null,
      exif: null,
      detectedMimeType: detectedMime,
      extractionError: null,
      extractedAt: Date.now(),
    };

    // Use MIME type if available, fall back to extension
    const category = mimeCategory(detectedMime ?? undefined);

    if (category === 'image' || (!category && IMAGE_EXTS.has(ext))) {
      base.exif = await this._extractExif(filePath);
    } else if (category === 'pdf' || (!category && PDF_EXTS.has(ext))) {
      base.extractedText = await this._extractPdf(filePath);
    } else if (category === 'docx' || (!category && DOCX_EXTS.has(ext))) {
      base.extractedText = await this._extractDocx(filePath);
    } else if (category === 'audio' || (!category && AUDIO_EXTS.has(ext))) {
      base.extractedText = await this._extractAudio(filePath);
    }

    return base;
  }

  private async _extractExif(filePath: string): Promise<ExifData | null> {
    try {
      const data = await exifr.parse(filePath, {
        gps: true,
        xmp: true,
        icc: true,
        reviveValues: false, // Keep DateTimeOriginal as string
      });

      if (!data) return null;

      const width = data.ExifImageWidth ?? data.ImageWidth ?? null;
      const height = data.ExifImageHeight ?? data.ImageHeight ?? null;

      return {
        dateTaken: data.DateTimeOriginal ?? null,
        camera: [data.Make, data.Model].filter(Boolean).join(' ') || null,
        lens: data.LensModel ?? null,
        dimensions: width != null && height != null ? { width, height } : null,
        gps:
          data.latitude != null && data.longitude != null
            ? {
                latitude: data.latitude,
                longitude: data.longitude,
                altitude: data.GPSAltitude ?? null,
              }
            : null,
        orientation: data.Orientation ?? null,
      };
    } catch {
      // No EXIF data (e.g. PNGs without metadata) — not an error
      return null;
    }
  }

  private async _extractPdf(filePath: string): Promise<string | null> {
    const buffer = await readFile(filePath);
    const { text } = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
    let trimmed = text?.trim() || '';
    if (trimmed.length > this._config.maxTextLength) {
      trimmed = trimmed.slice(0, this._config.maxTextLength);
    }
    return trimmed || null;
  }

  private async _extractDocx(filePath: string): Promise<string | null> {
    const result = await mammoth.extractRawText({ path: filePath });
    let text = result.value?.trim() || '';
    if (text.length > this._config.maxTextLength) {
      text = text.slice(0, this._config.maxTextLength);
    }
    return text || null;
  }

  private async _extractAudio(filePath: string): Promise<string | null> {
    try {
      const metadata = await parseFile(filePath, { skipCovers: true });
      const { common, format } = metadata;

      const parts: string[] = [];
      if (common.artist) parts.push(`Artist: ${common.artist}`);
      if (common.album) parts.push(`Album: ${common.album}`);
      if (common.title) parts.push(`Title: ${common.title}`);
      if (common.year) parts.push(`Year: ${common.year}`);
      if (common.genre?.length) parts.push(`Genre: ${common.genre.join(', ')}`);
      if (format.duration) {
        const mins = Math.floor(format.duration / 60);
        const secs = Math.floor(format.duration % 60);
        parts.push(`Duration: ${mins}:${secs.toString().padStart(2, '0')}`);
      }

      const text = parts.join(' | ');
      if (!text) return null;
      if (text.length > this._config.maxTextLength) {
        return text.slice(0, this._config.maxTextLength);
      }
      return text;
    } catch {
      return null;
    }
  }
}
