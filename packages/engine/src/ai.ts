import { z } from 'zod';
import OpenAI from 'openai';
import pRetry from 'p-retry';
import { AIError } from './errors.js';
import type { ActionPlan, FileIndexEntry, IndexStats, PlanOptions, SmartFolderMessage, SmartFolderResponse } from './types.js';

// ============================================================
// Zod schemas for validating AI response
// ============================================================

export const ActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['move_file', 'rename_file', 'create_folder', 'copy_file']),
  source: z.string().min(1),
  destination: z.string().min(1),
  reason: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export const ActionPlanSchema = z.object({
  intent: z.string().min(1).max(200),
  actions: z.array(ActionSchema).min(0).max(1000),
  needsReview: z.array(z.string()),
  summary: z.object({
    filesAffected: z.number().int().min(0),
    foldersCreated: z.number().int().min(0),
    totalSizeBytes: z.number().int().min(0),
  }),
  warnings: z.array(z.string()).max(20),
});

// ============================================================
// JSON Schema for OpenRouter tool calling
// ============================================================

export const ACTION_PLAN_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    intent: { type: 'string', description: 'Brief summary of what the plan will accomplish' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID for this action' },
          type: {
            type: 'string',
            enum: ['move_file', 'rename_file', 'create_folder', 'copy_file'],
          },
          source: { type: 'string', description: 'Absolute source path' },
          destination: { type: 'string', description: 'Absolute destination path' },
          reason: { type: 'string', description: 'Human-readable reason for this action' },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score 0.0-1.0',
          },
        },
        required: ['id', 'type', 'source', 'destination', 'reason', 'confidence'],
      },
    },
    needsReview: {
      type: 'array',
      items: { type: 'string' },
      description: 'UUIDs of actions with confidence < 0.5 that need human review',
    },
    summary: {
      type: 'object',
      properties: {
        filesAffected: { type: 'integer', minimum: 0 },
        foldersCreated: { type: 'integer', minimum: 0 },
        totalSizeBytes: { type: 'integer', minimum: 0 },
      },
      required: ['filesAffected', 'foldersCreated', 'totalSizeBytes'],
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Potential issues or caveats about this plan',
    },
  },
  required: ['intent', 'actions', 'needsReview', 'summary', 'warnings'],
};

// ============================================================
// Prompt templates
// ============================================================
// Query Expansion (pre-filter)
// ============================================================

export const QueryExpansionSchema = z.object({
  keywords: z.array(z.string()).min(1),
  folderPatterns: z.array(z.string()),
  extensions: z.array(z.string()),
  reasoning: z.string(),
});

export type QueryExpansion = z.infer<typeof QueryExpansionSchema>;

const QUERY_EXPANSION_PROMPT = `You are a file search assistant. Given a user's file organization command and context about their filesystem, expand the command into search terms that will find ALL relevant files.

Think about:
- What the user's project/topic probably involves
- What file types it would include
- What folder names or paths might contain these files
- Synonyms and related terms the files might use

Respond with ONLY valid JSON matching this format:
{"keywords": ["term1", "term2"], "folderPatterns": ["path/fragment"], "extensions": ["pdf", "docx"], "reasoning": "Brief explanation of what you're looking for"}`;

export function buildExpansionPrompt(
  command: string,
  folders: string[],
  stats: IndexStats,
): string {
  const topExts = Object.entries(stats.byExtension)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([ext, count]) => `${ext} (${count})`)
    .join(', ');

  const folderList = folders.slice(0, 30).map((f) => `  ${f}`).join('\n');

  return `COMMAND: "${command}"

TOP FOLDERS ON DISK:
${folderList}

INDEX: ${stats.totalFiles} files. Top extensions: ${topExts}

Generate search keywords, folder path fragments, and extension filters to find all files related to this command.`;
}

// ============================================================
// Plan Generation
// ============================================================

export const SYSTEM_PROMPT = `You are FileMom, an AI assistant that helps users organize their files. Your job is to understand natural language commands about file organization and generate structured action plans using the create_action_plan tool.

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

You MUST use the create_action_plan tool to submit your plan. Do not output raw JSON.`;

export const REFINEMENT_SYSTEM_PROMPT = `You are FileMom, an AI assistant refining a file organization plan based on user feedback.

RULES:
1. Keep actions the user did NOT mention unchanged
2. Only modify, add, or remove actions that the user's feedback addresses
3. Maintain absolute paths in all actions
4. Update the summary and warnings to reflect changes
5. If the user says "don't move X", remove those actions
6. If the user suggests a different destination, update the destination
7. Preserve action IDs for unchanged actions, generate new UUIDs for new actions

You MUST use the create_action_plan tool to submit the refined plan.`;

// ============================================================
// Smart Folder Conversation
// ============================================================

const SMART_FOLDER_PROMPT = `You are FileMom, helping a user create a smart folder. The user will name a folder and describe what files belong in it. Your job is to:

1. Ask 2-3 SHORT clarifying questions to narrow the criteria (one response, numbered list)
2. After the user answers, generate precise search criteria and set "done" to true

AVAILABLE FILTER FIELDS (use only what's relevant):
- q: free-text search keywords (space-separated, searched in filenames + content + AI descriptions)
- category: one of financial, work, personal, medical, legal, education, creative, communication, reference, media
- contentType: one of photo, screenshot, scan, document, spreadsheet, audio, other
- dateContext: time period like "2024", "Q4 2024", "Summer 2023"
- source: origin like "Amazon", "work"
- sensitive: true if only sensitive/PII files
- tags: array of tag strings to match
- extensions: array of file extensions like ["pdf", "docx"]

RULES:
- First response: ask 2-3 clarifying questions, set done=false, criteria=null
- After user answers: provide final criteria with done=true
- Be concise — no more than 3 questions
- Only include filter fields that are relevant to the user's request

Respond with ONLY valid JSON:
{"message": "your text", "criteria": null, "done": false}
or
{"message": "your text", "criteria": {"q": "...", "category": "..."}, "done": true}`;

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

Use the create_action_plan tool to submit your plan.`;

  return prompt;
}

export function buildRefinementPrompt(
  currentPlan: ActionPlan,
  feedback: string,
  history: string[],
): string {
  let prompt = `CURRENT PLAN:
${JSON.stringify(currentPlan, null, 2)}

USER FEEDBACK: "${feedback}"`;

  if (history.length > 1) {
    prompt += `

PREVIOUS FEEDBACK (for context):
${history.slice(0, -1).map((h, i) => `${i + 1}. "${h}"`).join('\n')}`;
  }

  prompt += `

Refine the plan based on the user's feedback. Use the create_action_plan tool to submit the updated plan.`;

  return prompt;
}

// ============================================================
// AI Interface
// ============================================================

export interface AIInterfaceConfig {
  apiKey: string;
  model: string;
  maxFilesPerRequest: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  maxRefinementRounds: number;
}

export class AIInterface {
  private _client: OpenAI;
  private _totalCost: number = 0;

  constructor(private _config: AIInterfaceConfig) {
    this._client = new OpenAI({
      apiKey: _config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://filemom.app',
        'X-OpenRouter-Title': 'FileMom',
      },
    });
  }

  async expandQuery(
    command: string,
    folders: string[],
    stats: IndexStats,
  ): Promise<QueryExpansion> {
    const userMessage = buildExpansionPrompt(command, folders, stats);

    const result = await pRetry(
      async () => {
        const response = await this._client.chat.completions.create({
          model: this._config.model,
          messages: [
            { role: 'system', content: QUERY_EXPANSION_PROMPT },
            { role: 'user', content: userMessage },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500,
        });

        const usage = response.usage as Record<string, unknown> | undefined;
        if (usage && typeof usage.cost === 'number') {
          this._totalCost += usage.cost;
        }

        const content = response.choices[0]?.message?.content;
        if (!content) throw new AIError('No content in query expansion response');

        const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        return QueryExpansionSchema.parse(JSON.parse(cleaned));
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

    return result;
  }

  async generatePlan(
    command: string,
    files: FileIndexEntry[],
    options?: PlanOptions,
  ): Promise<ActionPlan> {
    const trimmedFiles = files.slice(0, this._config.maxFilesPerRequest);
    const userMessage = buildUserPrompt(command, trimmedFiles, options?.context);

    const response = await this._callOpenRouter(SYSTEM_PROMPT, userMessage);
    return this._parseResponse(response);
  }

  async refinePlan(
    currentPlan: ActionPlan,
    feedback: string,
    history: string[],
  ): Promise<ActionPlan> {
    const userMessage = buildRefinementPrompt(currentPlan, feedback, history);
    const response = await this._callOpenRouter(REFINEMENT_SYSTEM_PROMPT, userMessage);
    return this._parseResponse(response);
  }

  async smartFolderConverse(
    folderName: string,
    description: string,
    messages: SmartFolderMessage[],
  ): Promise<SmartFolderResponse> {
    let userContent = `FOLDER NAME: "${folderName}"\nDESCRIPTION: "${description}"`;
    if (messages.length > 0) {
      userContent += '\n\nCONVERSATION:\n';
      for (const msg of messages) {
        userContent += `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}\n`;
      }
    }

    const response = await pRetry(
      async () => {
        const result = await this._client.chat.completions.create({
          model: this._config.model,
          messages: [
            { role: 'system', content: SMART_FOLDER_PROMPT },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500,
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

    const choice = response.choices[0];
    if (!choice?.message.content) {
      throw new AIError('Smart folder response contained no content');
    }

    let parsed: Record<string, unknown>;
    try {
      const cleaned = choice.message.content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new AIError(
        `Failed to parse smart folder response: ${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e : undefined,
      );
    }

    return {
      message: (parsed.message as string) ?? '',
      criteria: (parsed.criteria as SmartFolderResponse['criteria']) ?? null,
      matchCount: -1,
      done: (parsed.done as boolean) ?? false,
    };
  }

  getCost(): number {
    return this._totalCost;
  }

  private async _callOpenRouter(
    systemPrompt: string,
    userMessage: string,
  ): Promise<OpenAI.Chat.ChatCompletion> {
    return pRetry(
      async () => {
        const result = await this._client.chat.completions.create({
          model: this._config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'create_action_plan',
                description: 'Create a file organization action plan',
                parameters: ACTION_PLAN_JSON_SCHEMA,
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: 'create_action_plan' } },
        });

        // Track cost from OpenRouter response
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

  private _parseResponse(response: OpenAI.Chat.ChatCompletion): ActionPlan {
    const choice = response.choices[0];
    if (!choice) {
      throw new AIError('No response choices returned from AI');
    }

    // Try tool call first (expected path)
    const toolCall = choice.message.tool_calls?.[0];
    if (toolCall) {
      try {
        const rawPlan = JSON.parse(toolCall.function.arguments);
        return ActionPlanSchema.parse(rawPlan);
      } catch (e) {
        throw new AIError(
          `Failed to parse tool call response: ${e instanceof Error ? e.message : String(e)}`,
          e instanceof Error ? e : undefined,
        );
      }
    }

    // Fallback: try parsing message content as JSON
    const content = choice.message.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        return ActionPlanSchema.parse(parsed);
      } catch (e) {
        throw new AIError(
          `Failed to parse AI content as ActionPlan: ${e instanceof Error ? e.message : String(e)}`,
          e instanceof Error ? e : undefined,
        );
      }
    }

    throw new AIError('AI response contained no tool call and no content');
  }
}
