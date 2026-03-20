import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';
import pRetry from 'p-retry';
import pLimit from 'p-limit';
import { AIError } from './errors.js';
import type { VisionResult, FileRecord } from './types.js';

// ============================================================
// Vision Schemas
// ============================================================

const VisionResultSchema = z.object({
  description: z.string().min(1).max(500),
  category: z.string().min(1).max(50),
  tags: z.array(z.string()).min(1).max(10),
  confidence: z.number().min(0).max(1),
});

const VISION_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    description: {
      type: 'string',
      description: 'Concise 1-2 sentence description of the file contents',
    },
    category: {
      type: 'string',
      enum: ['photo', 'screenshot', 'document', 'diagram', 'receipt', 'meme', 'artwork', 'other'],
      description: 'Single category classification',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '3-8 descriptive tags for organization',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Classification confidence 0.0-1.0',
    },
  },
  required: ['description', 'category', 'tags', 'confidence'],
};

const VISION_SYSTEM_PROMPT = `You are a file analysis assistant. Describe the visual contents of this file for use in a file organization system.

RULES:
1. Provide a concise 1-2 sentence description of what the file contains
2. Classify into exactly one category: photo, screenshot, document, diagram, receipt, meme, artwork, or other
3. Extract 3-8 descriptive tags that would help find this file later
4. Assign a confidence level for your classification

Respond with ONLY valid JSON in this exact format:
{"description": "...", "category": "...", "tags": ["...", "..."], "confidence": 0.95}`;

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif', 'gif', 'avif',
]);

// ============================================================
// VisionEnricher
// ============================================================

export interface VisionEnricherConfig {
  apiKey: string;
  model: string;
  maxImageDimension: number;
  batchSize: number;
  concurrency: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export class VisionEnricher {
  private _client: OpenAI;
  private _totalCost: number = 0;

  constructor(private _config: VisionEnricherConfig) {
    this._client = new OpenAI({
      apiKey: _config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://filemom.app',
        'X-OpenRouter-Title': 'FileMom Vision',
      },
    });
  }

  async enrichFile(filePath: string): Promise<VisionResult> {
    const ext = extname(filePath).slice(1).toLowerCase();

    if (!IMAGE_EXTS.has(ext)) {
      throw new AIError(`Vision enrichment not supported for .${ext} files`);
    }

    // Preprocess image: resize + convert to JPEG base64
    const base64 = await this._preprocessImage(filePath);

    // Call VLM via OpenRouter
    const response = await pRetry(
      async () => {
        const result = await this._client.chat.completions.create({
          model: this._config.model,
          messages: [
            { role: 'system', content: VISION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe this file for organization purposes. Respond with JSON only.' },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${base64}` },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500,
        });

        // Track cost
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

    return this._parseResponse(response, filePath);
  }

  async enrichBatch(
    files: FileRecord[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Map<string, VisionResult>> {
    const limit = pLimit(this._config.concurrency);
    const results = new Map<string, VisionResult>();
    let completed = 0;

    const tasks = files.map((file) =>
      limit(async () => {
        try {
          const result = await this.enrichFile(file.path);
          results.set(file.path, result);
        } catch {
          // Skip files that fail — don't block the batch
        }
        completed++;
        onProgress?.(completed, files.length);
      }),
    );

    await Promise.all(tasks);
    return results;
  }

  getCost(): number {
    return this._totalCost;
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

  private _parseResponse(
    response: OpenAI.Chat.ChatCompletion,
    filePath: string,
  ): VisionResult {
    const choice = response.choices[0];
    if (!choice) {
      throw new AIError('No response choices from vision model');
    }

    const content = choice.message.content;
    if (!content) {
      throw new AIError('Vision response contained no content');
    }

    let parsed: unknown;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new AIError(
        `Failed to parse vision JSON: ${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e : undefined,
      );
    }

    const validated = VisionResultSchema.parse(parsed);

    return {
      description: validated.description,
      category: validated.category,
      tags: validated.tags,
      confidence: validated.confidence,
      model: this._config.model,
      enrichedAt: Date.now(),
    };
  }
}
