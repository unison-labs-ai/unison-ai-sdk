import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
} from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import { recall, ingestConversation } from './client.js';

export { recall, ingestConversation } from './client.js';
export type { RecallOptions, RecallResult, IngestTurn, IngestOptions } from './client.js';

export interface UnisonMemoryOptions {
  token?: string;
  sessionId: string;
  apiUrl?: string;
  k?: number;
  recall?: boolean;
  persist?: boolean;
}

function resolveToken(opts: UnisonMemoryOptions): string {
  const token = opts.token ?? process.env['UNISON_TOKEN'];
  if (!token) {
    throw new Error(
      'Unison: no token provided. Set options.token or the UNISON_TOKEN environment variable.',
    );
  }
  return token;
}

function resolveApiUrl(opts: UnisonMemoryOptions): string {
  return opts.apiUrl ?? process.env['UNISON_API_URL'] ?? 'https://brain.unisonlabs.ai';
}

function extractLatestUserText(prompt: LanguageModelV3CallOptions['prompt']): string | null {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i]!;
    if (msg.role === 'user') {
      for (const part of msg.content) {
        if (part.type === 'text') {
          return part.text;
        }
      }
    }
  }
  return null;
}

function injectSystemMessage(
  prompt: LanguageModelV3Message[],
  contextMd: string,
): LanguageModelV3Message[] {
  const prefix = `Relevant memory from the Unison brain:\n${contextMd}`;
  const firstMsg = prompt[0];

  if (firstMsg?.role === 'system') {
    return [
      { ...firstMsg, content: `${prefix}\n\n${firstMsg.content}` },
      ...prompt.slice(1),
    ];
  }

  return [{ role: 'system', content: prefix }, ...prompt];
}

function extractAssistantText(result: LanguageModelV3GenerateResult): string {
  for (const part of result.content) {
    if (part.type === 'text') {
      return part.text;
    }
  }
  return '';
}

export function unisonMemory(options: UnisonMemoryOptions): LanguageModelMiddleware {
  const shouldRecall = options.recall !== false;
  const shouldPersist = options.persist !== false;

  return {
    specificationVersion: 'v3',

    async transformParams({ params }) {
      if (!shouldRecall) {
        return params;
      }

      const userText = extractLatestUserText(params.prompt);
      if (!userText) {
        return params;
      }

      let token: string;
      try {
        token = resolveToken(options);
      } catch (err) {
        console.warn('[unison-memory] recall skipped:', (err as Error).message);
        return params;
      }

      const apiUrl = resolveApiUrl(options);

      try {
        const result = await recall({
          apiUrl,
          token,
          q: userText,
          k: options.k ?? 5,
        });

        if (!result.weakEvidence && result.contextMd) {
          const newPrompt = injectSystemMessage(params.prompt, result.contextMd);
          return { ...params, prompt: newPrompt };
        }
      } catch (err) {
        console.warn('[unison-memory] recall error (continuing):', (err as Error).message);
      }

      return params;
    },

    async wrapGenerate({ doGenerate, params }) {
      const result = await doGenerate();

      if (shouldPersist) {
        const userText = extractLatestUserText(params.prompt);
        const assistantText = extractAssistantText(result);

        if (userText) {
          let token: string;
          try {
            token = resolveToken(options);
          } catch (err) {
            console.warn('[unison-memory] persist skipped:', (err as Error).message);
            return result;
          }

          const apiUrl = resolveApiUrl(options);

          ingestConversation({
            apiUrl,
            token,
            sessionId: options.sessionId,
            turns: [
              { role: 'user', content: userText },
              ...(assistantText ? [{ role: 'assistant' as const, content: assistantText }] : []),
            ],
          }).catch((err: unknown) => {
            console.warn('[unison-memory] persist error:', (err as Error).message);
          });
        }
      }

      return result;
    },
  };
}
