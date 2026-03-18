import { z } from 'zod';
import type { ActionPlan, FileIndexEntry } from './types.js';

// ============================================================
// Zod schemas for validating Claude's response
// ============================================================

export const ActionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_file', 'rename_file', 'create_folder', 'copy_file']),
  source: z.string().min(1),
  destination: z.string().min(1),
  reason: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export const ActionPlanSchema = z.object({
  intent: z.string().min(1).max(200),
  actions: z.array(ActionSchema).min(0).max(1000),
  needsReview: z.array(z.string().uuid()),
  summary: z.object({
    filesAffected: z.number().int().min(0),
    foldersCreated: z.number().int().min(0),
    totalSizeBytes: z.number().int().min(0),
  }),
  warnings: z.array(z.string()).max(20),
});

// ============================================================
// Claude prompt templates
// ============================================================

export const SYSTEM_PROMPT = `You are FileMom, an AI assistant that helps users organize their files. Your job is to understand natural language commands about file organization and generate structured action plans.

RULES:
1. Always use absolute paths in your responses
2. Never suggest deleting files unless explicitly asked
3. Group related files together logically
4. Preserve original folder structure when it makes sense
5. Create descriptive folder names that non-technical users will understand
6. When unsure about a file's purpose, assign lower confidence (< 0.8)
7. Flag potential issues in the warnings array
8. Consider file dates, names, and content when organizing

CONFIDENCE GUIDELINES:
- 0.9-1.0: Very confident (clear filename, EXIF location, obvious category)
- 0.7-0.9: Confident (reasonable inference from context)
- 0.5-0.7: Uncertain (multiple valid destinations possible)
- 0.0-0.5: Needs review (ambiguous, could be wrong)

OUTPUT FORMAT:
You must respond with valid JSON matching the provided schema. Do not include any text outside the JSON object.`;

export function buildUserPrompt(
  command: string,
  files: FileIndexEntry[],
  context?: { recentFolders?: string[]; previousCommands?: string[] },
): string {
  const filesJson = JSON.stringify(files, null, 2);

  let prompt = `USER COMMAND: "${command}"

FILE INDEX (${files.length} files):
${filesJson}
`;

  if (context?.recentFolders?.length) {
    prompt += `
RECENTLY USED FOLDERS:
${context.recentFolders.map((f) => `- ${f}`).join('\n')}
`;
  }

  prompt += `
Based on the user's command and the file index above, generate an action plan to organize these files. Consider:
- File names and extensions
- Modification dates
- Any extracted text or EXIF summaries
- The user's apparent intent

Return a JSON action plan.`;

  return prompt;
}

// ============================================================
// AI Interface class
// ============================================================

export interface AIInterfaceConfig {
  apiKey: string;
  model: string;
  maxFilesPerRequest: number;
  requestTimeoutMs: number;
}

// TODO: Implement in Phase 5
export class AIInterface {
  constructor(private _config: AIInterfaceConfig) {}

  async generatePlan(_command: string, _files: FileIndexEntry[]): Promise<ActionPlan> {
    // Phase 5: Anthropic SDK, pre-filtering, structured output, Zod validation, retries
    throw new Error('Not implemented');
  }
}
