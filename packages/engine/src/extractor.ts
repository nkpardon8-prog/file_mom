import type { ExtractedMetadata } from './types.js';

export interface ExtractorConfig {
  maxTextLength: number;
  timeoutMs: number;
  skipExtensions: string[];
}

// TODO: Implement in Phase 1
export class Extractor {
  constructor(private _config: ExtractorConfig) {}

  async extract(_filePath: string): Promise<ExtractedMetadata> {
    // Phase 1: xxHash, EXIF via exifreader, PDF via pdf-parse, DOCX via mammoth
    throw new Error('Not implemented');
  }
}
