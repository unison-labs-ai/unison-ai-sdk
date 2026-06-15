import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
} from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import { recall, ingestConversation, remember } from './client.js';
import type { IngestTurn } from './client.js';

export { recall, ingestConversation, remember } from './client.js';
export type {
  RecallOptions,
  RecallResult,
  IngestTurn,
  IngestOptions,
  RememberOptions,
  RememberResult,
} from './client.js';

export interface UnisonMemoryOptions {
  token?: string;
  sessionId: string;
  apiUrl?: string;
  k?: number;
  recall?: boolean;
  persist?: boolean;
  /**
   * Auto-run the `/remember` skill over the whole session — NOT per turn (that
   * would be one judgment LLM pass per generation). When true, the middleware
   * debounces and fires one `remember` after `rememberDebounceMs` of inactivity
   * (a session-end approximation). For an exact session-end, call `flush()`.
   * Default false — per-turn `ingest` already captures everything cheaply.
   */
  rememberOnFinish?: boolean;
  /** Debounce window for `rememberOnFinish`. Default 60_000ms. */
  rememberDebounceMs?: number;
}

/** The middleware, plus `flush()` to remember the accumulated session on demand
 *  (e.g. when the thread closes). */
export type UnisonMemoryMiddleware = LanguageModelMiddleware & {
  flush: () => Promise<void>;
};

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

export function unisonMemory(options: UnisonMemoryOptions): UnisonMemoryMiddleware {
  const shouldRecall = options.recall !== false;
  const shouldPersist = options.persist !== false;

  // Accumulated session turns for the optional session-level `remember`.
  const sessionTurns: IngestTurn[] = [];
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    if (debounce) {
      clearTimeout(debounce);
      debounce = null;
    }
    if (sessionTurns.length === 0) return;
    let token: string;
    try {
      token = resolveToken(options);
    } catch {
      return;
    }
    const turns = sessionTurns.splice(0); // take + clear atomically
    try {
      await remember({
        apiUrl: resolveApiUrl(options),
        token,
        dump: { turns },
        source: 'ai-sdk-session',
        sourceRef: options.sessionId,
      });
    } catch (err) {
      console.warn('[unison-memory] remember error:', (err as Error).message);
    }
  };

  const middleware: LanguageModelMiddleware = {
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

          const turns: IngestTurn[] = [
            { role: 'user', content: userText },
            ...(assistantText ? [{ role: 'assistant' as const, content: assistantText }] : []),
          ];

          ingestConversation({ apiUrl, token, sessionId: options.sessionId, turns }).catch(
            (err: unknown) => {
              console.warn('[unison-memory] persist error:', (err as Error).message);
            },
          );

          // Accumulate for the session-level remember (not per turn — see option docs).
          if (options.rememberOnFinish) {
            sessionTurns.push(...turns);
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
              void flush();
            }, options.rememberDebounceMs ?? 60_000);
            // Don't keep the process alive just for the debounce.
            (debounce as { unref?: () => void }).unref?.();
          }
        }
      }

      return result;
    },
  };

  return Object.assign(middleware, { flush });
}
