import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { remember, unisonMemory } from './index.js';

const MOCK_TOKEN = 'usk_live_testtoken';
const MOCK_SESSION = 'test-session-123';
const MOCK_API_URL = 'https://brain.unisonlabs.ai';

function makeMockGenerateResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}

function makeParams(
  userText: string,
  systemText?: string,
): LanguageModelV3CallOptions {
  const prompt: LanguageModelV3CallOptions['prompt'] = [];
  if (systemText) {
    prompt.push({ role: 'system', content: systemText });
  }
  prompt.push({
    role: 'user',
    content: [{ type: 'text', text: userText }],
  });
  return { prompt };
}

describe('unisonMemory', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('transformParams (recall)', () => {
    it('injects contextMd into system message when recall returns strong evidence', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          weakEvidence: false,
          contextMd: '- User prefers TypeScript',
          hits: [],
        }),
      });

      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
      });

      const params = makeParams('What language should I use?');
      const result = await middleware.transformParams!({
        type: 'generate',
        params,
        model: {} as never,
      });

      const systemMsg = result.prompt.find(m => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect((systemMsg as { role: 'system'; content: string }).content).toContain(
        'Relevant memory from the Unison brain:',
      );
      expect((systemMsg as { role: 'system'; content: string }).content).toContain(
        '- User prefers TypeScript',
      );
    });

    it('prepends memory before existing system message', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          weakEvidence: false,
          contextMd: '- Some memory',
          hits: [],
        }),
      });

      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
      });

      const params = makeParams('Hello', 'You are a helpful assistant.');
      const result = await middleware.transformParams!({
        type: 'generate',
        params,
        model: {} as never,
      });

      const systemMsg = result.prompt[0];
      expect(systemMsg?.role).toBe('system');
      const content = (systemMsg as { role: 'system'; content: string }).content;
      expect(content.indexOf('Relevant memory')).toBeLessThan(
        content.indexOf('You are a helpful assistant.'),
      );
    });

    it('does not modify params when weakEvidence is true', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          weakEvidence: true,
          contextMd: '- Some memory',
          hits: [],
        }),
      });

      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
      });

      const params = makeParams('What language should I use?');
      const result = await middleware.transformParams!({
        type: 'generate',
        params,
        model: {} as never,
      });

      expect(result.prompt).toEqual(params.prompt);
    });

    it('does not call fetch when recall=false', async () => {
      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
        recall: false,
      });

      const params = makeParams('Hello');
      await middleware.transformParams!({ type: 'generate', params, model: {} as never });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('degrades gracefully on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
      });

      const params = makeParams('Hello');
      const result = await middleware.transformParams!({
        type: 'generate',
        params,
        model: {} as never,
      });

      expect(result.prompt).toEqual(params.prompt);
      expect(warnSpy).toHaveBeenCalledWith(
        '[unison-memory] recall error (continuing):',
        'Network error',
      );
      warnSpy.mockRestore();
    });

    it('calls GET /v1/brain/context with correct query params', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ weakEvidence: true, contextMd: '', hits: [] }),
      });

      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
        k: 3,
      });

      const params = makeParams('Tell me about TypeScript');
      await middleware.transformParams!({ type: 'generate', params, model: {} as never });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v1/brain/context');
      expect(url).toContain('q=Tell+me+about+TypeScript');
      expect(url).toContain('k=3');
      expect(url).toContain('mode=auto');
      expect((opts.headers as Record<string, string>)['Authorization']).toBe(
        `Bearer ${MOCK_TOKEN}`,
      );
    });
  });

  describe('wrapGenerate (persist)', () => {
    it('POSTs to /v1/brain/ingest after generation', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });

      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
      });

      const generateResult = makeMockGenerateResult('TypeScript is great.');
      const doGenerate = vi.fn().mockResolvedValue(generateResult);
      const params = makeParams('Which language?');

      await middleware.wrapGenerate!({
        doGenerate,
        doStream: vi.fn(),
        params,
        model: {} as never,
      });

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${MOCK_API_URL}/v1/brain/ingest`);
      expect((opts.headers as Record<string, string>)['Authorization']).toBe(
        `Bearer ${MOCK_TOKEN}`,
      );

      const body = JSON.parse(opts.body as string) as {
        items: Array<{
          type: string;
          turns: Array<{ role: string; content: string }>;
          sourceRef: string;
          visibility: string;
        }>;
      };
      expect(body.items[0]?.type).toBe('conversation');
      expect(body.items[0]?.sourceRef).toBe(MOCK_SESSION);
      expect(body.items[0]?.visibility).toBe('private');
      const turns = body.items[0]?.turns ?? [];
      expect(turns.some(t => t.role === 'user' && t.content === 'Which language?')).toBe(true);
      expect(turns.some(t => t.role === 'assistant' && t.content === 'TypeScript is great.')).toBe(
        true,
      );
    });

    it('does not call fetch when persist=false', async () => {
      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
        persist: false,
      });

      const generateResult = makeMockGenerateResult('Hello');
      const doGenerate = vi.fn().mockResolvedValue(generateResult);
      const params = makeParams('Hi');

      await middleware.wrapGenerate!({
        doGenerate,
        doStream: vi.fn(),
        params,
        model: {} as never,
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns generate result even if ingest fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Ingest error'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const middleware = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
      });

      const generateResult = makeMockGenerateResult('Result text');
      const doGenerate = vi.fn().mockResolvedValue(generateResult);
      const params = makeParams('Query');

      const result = await middleware.wrapGenerate!({
        doGenerate,
        doStream: vi.fn(),
        params,
        model: {} as never,
      });

      expect(result).toEqual(generateResult);
      warnSpy.mockRestore();
    });
  });
});

describe('remember', () => {
  it('POSTs the dump to /v1/brain/remember and returns the jobId', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ jobId: 'job-1' }) });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = await remember({
        apiUrl: MOCK_API_URL,
        token: MOCK_TOKEN,
        dump: 'we chose Postgres',
        source: 'claude-code-session',
      });
      expect(res.jobId).toBe('job-1');
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${MOCK_API_URL}/v1/brain/remember`);
      expect((opts.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`);
      const body = JSON.parse(opts.body as string) as { dump: string; source: string };
      expect(body.dump).toBe('we chose Postgres');
      expect(body.source).toBe('claude-code-session');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' }));
    try {
      await expect(
        remember({ apiUrl: MOCK_API_URL, token: 'bad', dump: 'x' }),
      ).rejects.toThrow(/remember failed: 401/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('unisonMemory rememberOnFinish + flush', () => {
  it('flush() remembers the accumulated session via POST /v1/brain/remember', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobId: 'j' }) });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const mem = unisonMemory({
        token: MOCK_TOKEN,
        sessionId: MOCK_SESSION,
        apiUrl: MOCK_API_URL,
        rememberOnFinish: true,
      });
      const doGenerate = vi.fn().mockResolvedValue(makeMockGenerateResult('Postgres it is.'));
      await mem.wrapGenerate!({ doGenerate, doStream: vi.fn(), params: makeParams('Which DB?'), model: {} as never });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled()); // the per-turn ingest fired

      await mem.flush();
      const rememberCall = (fetchMock.mock.calls as [string, RequestInit][]).find(([u]) =>
        u.endsWith('/v1/brain/remember'),
      );
      expect(rememberCall).toBeDefined();
      const body = JSON.parse(rememberCall![1].body as string) as {
        dump: { turns: { role: string; content: string }[] };
        sourceRef: string;
      };
      expect(body.sourceRef).toBe(MOCK_SESSION);
      expect(body.dump.turns.some((t) => t.content === 'Which DB?')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('flush() is a no-op when nothing was accumulated', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const mem = unisonMemory({ token: MOCK_TOKEN, sessionId: MOCK_SESSION, apiUrl: MOCK_API_URL });
      await mem.flush();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
