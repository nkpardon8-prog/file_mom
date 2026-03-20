import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';
import pRetry from 'p-retry';
import pLimit from 'p-limit';
import { AIError } from './errors.js';
import type { FileRecord, AIContentType } from './types.js';

// ============================================================
// Config & Return Types
// ============================================================

export interface DescriberConfig {
  apiKey: string;
  visionModel: string;
  textModel: string;
  concurrency: number;
  retryAttempts: number;
  retryDelayMs: number;
  maxImageDimension: number;
}

export interface DescriptionFields {
  aiDescription: string;
  aiCategory: string;
  aiSubcategory: string;
  aiTags: string;
  aiDateContext: string | null;
  aiSource: string | null;
  aiContentType: string;
  aiConfidence: number;
  aiSensitive: boolean;
  aiSensitiveType: string | null;
  aiDetails: string | null;
  aiDescribedAt: number;
  aiDescriptionModel: string;
}

// ============================================================
// Extension Sets
// ============================================================

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif', 'gif', 'avif',
]);
const DOCUMENT_EXTS = new Set(['pdf', 'docx', 'doc', 'txt', 'rtf']);
const SPREADSHEET_EXTS = new Set(['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'ods']);
const AUDIO_EXTS = new Set([
  'mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'wma', 'opus', 'aiff', 'aif',
]);

// ============================================================
// Zod Validation Schema
// ============================================================

const AI_CATEGORIES = [
  'financial', 'work', 'personal', 'medical', 'legal',
  'education', 'creative', 'communication', 'reference', 'media',
] as const;

const AI_CONTENT_TYPES = [
  'photo', 'screenshot', 'scan', 'document', 'spreadsheet', 'audio', 'other',
] as const;

export const DescriptionResponseSchema = z.object({
  description: z.string().min(1).max(500),
  category: z.enum(AI_CATEGORIES),
  subcategory: z.string().min(1).max(100),
  tags: z.array(z.string().max(50)).min(1).max(15),
  dateContext: z.string().max(100).nullable(),
  source: z.string().max(200).nullable(),
  confidence: z.number().min(0).max(1),
  sensitive: z.boolean(),
  sensitiveType: z.string().max(50).nullable(),
  contentType: z.enum(AI_CONTENT_TYPES).optional(),
  details: z.record(z.unknown()).optional(),
});

// ============================================================
// Prompt Templates
// ============================================================

const IMAGE_SYSTEM_PROMPT = `You are a file analysis assistant. Analyze this image for a file organization system.

STEP 1: Classify the image as exactly ONE of:
- "photo" — a real photograph taken with a camera
- "screenshot" — a capture of a digital screen or UI
- "scan" — a photo or scan of a physical document

STEP 2: Generate a structured description.

VALID CATEGORIES: financial, work, personal, medical, legal, education, creative, communication, reference, media

RESPOND WITH ONLY VALID JSON:
{
  "contentType": "photo|screenshot|scan",
  "description": "1-2 sentence description of what this image shows",
  "category": "one of the valid categories above",
  "subcategory": "specific type within category (e.g. receipt, vacation_photo, error_message)",
  "tags": ["3-8 descriptive tags for organization"],
  "dateContext": "time period if identifiable, or null",
  "source": "origin if identifiable (e.g. Instagram, work meeting), or null",
  "confidence": 0.0-1.0,
  "sensitive": false,
  "sensitiveType": "financial|medical|pii|legal or null",
  "details": {
    "For photos": { "sceneType": "outdoor_beach", "setting": "location", "people": { "count": 0, "descriptions": [] }, "objects": [], "mood": "relaxed", "quality": "high" },
    "For screenshots": { "application": "app name", "platform": "macOS", "purpose": "conversation|error|data", "textContent": "visible text" },
    "For scans": { "documentType": "receipt|letter|form", "textContent": "OCR text", "isHandwritten": false, "quality": "clear" }
  }
}`;

const DOCUMENT_SYSTEM_PROMPT = `You are a file analysis assistant. Analyze this document for a file organization system.

VALID CATEGORIES: financial, work, personal, medical, legal, education, creative, communication, reference, media

Analyze the filename and content carefully. Extract key entities, dates, and determine sensitivity.

RESPOND WITH ONLY VALID JSON:
{
  "description": "1-2 sentence description of the document",
  "category": "one of the valid categories",
  "subcategory": "invoice|contract|report|letter|form|resume|memo|article|manual|other",
  "tags": ["3-8 descriptive tags"],
  "dateContext": "time period referenced in content, or null",
  "source": "company/person/origin if identifiable, or null",
  "confidence": 0.0-1.0,
  "sensitive": false,
  "sensitiveType": "financial|medical|pii|legal or null",
  "details": {
    "documentType": "invoice|contract|report|letter|form|resume|other",
    "subject": "brief subject line",
    "summary": "2-3 sentence summary",
    "entities": {
      "companies": [{ "name": "...", "role": "vendor|client|employer" }],
      "people": [{ "name": "...", "role": "author|recipient|signee" }],
      "amounts": [{ "value": 0, "currency": "USD", "context": "total due" }],
      "dates": [{ "date": "2024-01-15", "context": "invoice date" }],
      "references": [{ "type": "invoice_number", "value": "INV-001" }]
    }
  }
}`;

const SPREADSHEET_SYSTEM_PROMPT = `You are a file analysis assistant. Analyze this spreadsheet for a file organization system.

VALID CATEGORIES: financial, work, personal, medical, legal, education, creative, communication, reference, media

Analyze the filename, sheet names, column headers, and sample data to understand what this spreadsheet tracks.

RESPOND WITH ONLY VALID JSON:
{
  "description": "1-2 sentence description of the spreadsheet",
  "category": "one of the valid categories",
  "subcategory": "tracker|report|inventory|budget|schedule|contact_list|other",
  "tags": ["3-8 descriptive tags"],
  "dateContext": "time period if identifiable, or null",
  "source": "origin if identifiable, or null",
  "confidence": 0.0-1.0,
  "sensitive": false,
  "sensitiveType": "financial|medical|pii|legal or null",
  "details": {
    "dataType": "expense_tracker|inventory|contact_list|schedule|report|other",
    "subject": "what this spreadsheet tracks",
    "columns": ["column names"],
    "rowCount": 0,
    "sheetNames": ["sheet names"],
    "keyInsights": ["1-3 observations about the data"]
  }
}`;

// ============================================================
// MIME-type helpers
// ============================================================

function mimeToContentType(mime: string | null): AIContentType | null {
  if (!mime) return null;
  if (mime.startsWith('image/')) return 'photo';
  if (mime === 'application/pdf') return 'document';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'document';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'text/csv' ||
    mime === 'text/tab-separated-values' ||
    mime === 'application/vnd.oasis.opendocument.spreadsheet'
  ) return 'spreadsheet';
  return null;
}

// ============================================================
// Describer
// ============================================================

export class Describer {
  private _client: OpenAI;
  private _totalCost = 0;

  constructor(private _config: DescriberConfig) {
    this._client = new OpenAI({
      apiKey: _config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://filemom.app',
        'X-OpenRouter-Title': 'FileMom Describer',
      },
    });
  }

  detectContentType(record: FileRecord): AIContentType {
    const ext = extname(record.path).slice(1).toLowerCase();

    // Extension-based detection
    if (IMAGE_EXTS.has(ext)) return 'photo';
    if (DOCUMENT_EXTS.has(ext)) return 'document';
    if (SPREADSHEET_EXTS.has(ext)) return 'spreadsheet';
    if (AUDIO_EXTS.has(ext)) return 'audio';

    // Fallback to detected MIME type
    const fromMime = mimeToContentType(record.detectedMimeType);
    if (fromMime) return fromMime;

    return 'other';
  }

  async describeFile(record: FileRecord): Promise<DescriptionFields> {
    const type = this.detectContentType(record);

    switch (type) {
      case 'photo':
      case 'screenshot':
      case 'scan':
        return this._describeImage(record);
      case 'document':
        return this._describeDocument(record);
      case 'spreadsheet':
        return this._describeSpreadsheet(record);
      case 'audio':
        return this._describeAudio(record);
      default:
        return this._describeGeneric(record);
    }
  }

  async describeBatch(
    records: FileRecord[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Map<string, DescriptionFields>> {
    const limit = pLimit(this._config.concurrency);
    const results = new Map<string, DescriptionFields>();
    let completed = 0;

    const tasks = records.map((record) =>
      limit(async () => {
        try {
          const result = await this.describeFile(record);
          results.set(record.path, result);
        } catch {
          // Skip files that fail — don't block the batch
        }
        completed++;
        onProgress?.(completed, records.length);
      }),
    );

    await Promise.all(tasks);
    return results;
  }

  getCost(): number {
    return this._totalCost;
  }

  // ============================================================
  // Per-Type Description Methods
  // ============================================================

  private async _describeImage(record: FileRecord): Promise<DescriptionFields> {
    const base64 = await this._preprocessImage(record.path);

    // Build context hints from EXIF
    let contextHint = '';
    if (record.exifJson) {
      try {
        const exif = JSON.parse(record.exifJson);
        const parts: string[] = [];
        if (exif.dateTaken) parts.push(`Date taken: ${exif.dateTaken}`);
        if (exif.camera) parts.push(`Camera: ${exif.camera}`);
        if (exif.gps) parts.push(`GPS: ${exif.gps.latitude}, ${exif.gps.longitude}`);
        if (parts.length) contextHint = `\n\nAdditional metadata:\n${parts.join('\n')}`;
      } catch { /* ignore bad JSON */ }
    }

    const userMessage = `Describe this file for organization purposes.${contextHint}\n\nFilename: ${record.name}\n\nRespond with JSON only.`;
    const response = await this._callVLM(IMAGE_SYSTEM_PROMPT, userMessage, base64);
    const parsed = this._parseResponse(response);

    return this._mapToFields(parsed, parsed.contentType ?? 'photo', this._config.visionModel);
  }

  private async _describeDocument(record: FileRecord): Promise<DescriptionFields> {
    const text = record.extractedText?.slice(0, 3000) ?? '';
    if (!text) {
      return this._emptyDescription(record, 'document');
    }

    const userMessage = `FILENAME: ${record.name}\n\nCONTENT (first 3000 chars):\n${text}`;
    const response = await this._callTextLLM(DOCUMENT_SYSTEM_PROMPT, userMessage);
    const parsed = this._parseResponse(response);

    return this._mapToFields(parsed, 'document', this._config.textModel);
  }

  private async _describeSpreadsheet(record: FileRecord): Promise<DescriptionFields> {
    const text = record.extractedText?.slice(0, 3000) ?? '';
    if (!text) {
      return this._emptyDescription(record, 'spreadsheet');
    }

    const userMessage = `FILENAME: ${record.name}\n\nCONTENT:\n${text}`;
    const response = await this._callTextLLM(SPREADSHEET_SYSTEM_PROMPT, userMessage);
    const parsed = this._parseResponse(response);

    return this._mapToFields(parsed, 'spreadsheet', this._config.textModel);
  }

  private _describeAudio(record: FileRecord): DescriptionFields {
    const text = record.extractedText ?? '';

    // Parse formatted audio metadata: "Artist: X | Album: Y | Title: Z"
    const parts: Record<string, string> = {};
    for (const segment of text.split(' | ')) {
      const colonIdx = segment.indexOf(': ');
      if (colonIdx > 0) {
        parts[segment.slice(0, colonIdx).trim()] = segment.slice(colonIdx + 2).trim();
      }
    }

    const artist = parts['Artist'] ?? null;
    const album = parts['Album'] ?? null;
    const title = parts['Title'] ?? null;
    const genre = parts['Genre'] ?? null;
    const yearStr = parts['Year'] ?? null;
    const year = yearStr ? parseInt(yearStr, 10) : null;
    const duration = parts['Duration'] ?? null;

    const descParts = [title, artist && `by ${artist}`, album && `from "${album}"`].filter(Boolean);
    const description = descParts.length > 0
      ? descParts.join(' ')
      : `Audio file: ${record.name}`;

    const tags = [artist, album, genre, yearStr].filter((t): t is string => !!t);

    return {
      aiDescription: description,
      aiCategory: 'media',
      aiSubcategory: genre?.toLowerCase() ?? 'audio',
      aiTags: JSON.stringify(tags.length > 0 ? tags : [record.extension || 'audio']),
      aiDateContext: yearStr,
      aiSource: artist,
      aiContentType: 'audio',
      aiConfidence: text ? 0.9 : 0.3,
      aiSensitive: false,
      aiSensitiveType: null,
      aiDetails: JSON.stringify({
        contentType: title ? 'music' : 'audio',
        artist,
        album,
        title,
        genre,
        year: year && !isNaN(year) ? year : null,
        duration,
        isVoiceRecording: !artist && !title,
      }),
      aiDescribedAt: Date.now(),
      aiDescriptionModel: 'metadata',
    };
  }

  private _describeGeneric(record: FileRecord): DescriptionFields {
    return this._emptyDescription(record, 'other');
  }

  private _emptyDescription(record: FileRecord, contentType: AIContentType): DescriptionFields {
    const label = contentType.charAt(0).toUpperCase() + contentType.slice(1);
    return {
      aiDescription: `${label} file: ${record.name}`,
      aiCategory: 'reference',
      aiSubcategory: contentType,
      aiTags: JSON.stringify([record.extension || 'file']),
      aiDateContext: null,
      aiSource: null,
      aiContentType: contentType,
      aiConfidence: 0.1,
      aiSensitive: false,
      aiSensitiveType: null,
      aiDetails: null,
      aiDescribedAt: Date.now(),
      aiDescriptionModel: 'none',
    };
  }

  // ============================================================
  // LLM Call Helpers
  // ============================================================

  private async _callVLM(
    systemPrompt: string,
    userMessage: string,
    base64: string,
  ): Promise<OpenAI.Chat.ChatCompletion> {
    return pRetry(
      async () => {
        const result = await this._client.chat.completions.create({
          model: this._config.visionModel,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: userMessage },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${base64}` },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 800,
        });

        const usage = result.usage as Record<string, unknown> | undefined;
        if (usage && typeof usage.cost === 'number') {
          this._totalCost += usage.cost;
        }

        return result;
      },
      {
        retries: this._config.retryAttempts,
        minTimeout: this._config.retryDelayMs,
        shouldRetry: (err: unknown) => {
          if (err instanceof OpenAI.APIError) {
            return [408, 429, 502, 503].includes(err.status ?? 0);
          }
          return false;
        },
      },
    );
  }

  private async _callTextLLM(
    systemPrompt: string,
    userMessage: string,
  ): Promise<OpenAI.Chat.ChatCompletion> {
    return pRetry(
      async () => {
        const result = await this._client.chat.completions.create({
          model: this._config.textModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 800,
        });

        const usage = result.usage as Record<string, unknown> | undefined;
        if (usage && typeof usage.cost === 'number') {
          this._totalCost += usage.cost;
        }

        return result;
      },
      {
        retries: this._config.retryAttempts,
        minTimeout: this._config.retryDelayMs,
        shouldRetry: (err: unknown) => {
          if (err instanceof OpenAI.APIError) {
            return [408, 429, 502, 503].includes(err.status ?? 0);
          }
          return false;
        },
      },
    );
  }

  // ============================================================
  // Response Parsing & Image Preprocessing
  // ============================================================

  private _parseResponse(
    response: OpenAI.Chat.ChatCompletion,
  ): z.infer<typeof DescriptionResponseSchema> {
    const choice = response.choices[0];
    if (!choice) {
      throw new AIError('No response choices from description model');
    }

    const content = choice.message.content;
    if (!content) {
      throw new AIError('Description response contained no content');
    }

    let parsed: unknown;
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new AIError(
        `Failed to parse description JSON: ${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e : undefined,
      );
    }

    try {
      return DescriptionResponseSchema.parse(parsed);
    } catch (e) {
      throw new AIError(
        `Description response failed validation: ${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e : undefined,
      );
    }
  }

  private _mapToFields(
    parsed: z.infer<typeof DescriptionResponseSchema>,
    contentType: string,
    model: string,
  ): DescriptionFields {
    return {
      aiDescription: parsed.description,
      aiCategory: parsed.category,
      aiSubcategory: parsed.subcategory,
      aiTags: JSON.stringify(parsed.tags),
      aiDateContext: parsed.dateContext,
      aiSource: parsed.source,
      aiContentType: contentType,
      aiConfidence: parsed.confidence,
      aiSensitive: parsed.sensitive,
      aiSensitiveType: parsed.sensitiveType,
      aiDetails: parsed.details ? JSON.stringify(parsed.details) : null,
      aiDescribedAt: Date.now(),
      aiDescriptionModel: model,
    };
  }

  private async _preprocessImage(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    const maxDim = this._config.maxImageDimension;

    const processed = await sharp(buffer)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return processed.toString('base64');
  }
}
