export interface RecallOptions {
  apiUrl: string;
  token: string;
  q: string;
  k?: number;
}

export interface RecallResult {
  weakEvidence: boolean;
  contextMd: string;
  hits: unknown[];
}

export interface IngestTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface IngestOptions {
  apiUrl: string;
  token: string;
  turns: IngestTurn[];
  sessionId: string;
}

export async function recall(opts: RecallOptions): Promise<RecallResult> {
  const url = new URL(`${opts.apiUrl}/v1/brain/context`);
  url.searchParams.set('q', opts.q);
  url.searchParams.set('k', String(opts.k ?? 5));
  url.searchParams.set('mode', 'auto');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${opts.token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Unison recall failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<RecallResult>;
}

export interface RememberOptions {
  apiUrl: string;
  token: string;
  /** What to remember: freeform text, conversation turns, or a raw session log. */
  dump: string | { turns: IngestTurn[] } | { sessionJsonl: string };
  /** Provenance label, e.g. "claude-code-session". */
  source?: string;
  /** Stable id → idempotent re-remember. */
  sourceRef?: string;
  /** Optional steering, e.g. "focus on decisions". */
  hints?: string;
}

export interface RememberResult {
  jobId: string;
}

/**
 * Run the `/remember` skill server-side over a dump: applies the save-or-skip
 * filter, dedupes, and files curated /private/kb notes + entity facts. Returns
 * a jobId; the work runs in the background.
 */
export async function remember(opts: RememberOptions): Promise<RememberResult> {
  const res = await fetch(`${opts.apiUrl}/v1/brain/remember`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dump: opts.dump,
      source: opts.source,
      sourceRef: opts.sourceRef,
      hints: opts.hints,
    }),
  });

  if (!res.ok) {
    throw new Error(`Unison remember failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<RememberResult>;
}

export async function ingestConversation(opts: IngestOptions): Promise<void> {
  const url = `${opts.apiUrl}/v1/brain/ingest`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          type: 'conversation',
          turns: opts.turns,
          sourceRef: opts.sessionId,
          visibility: 'private',
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Unison ingest failed: ${res.status} ${res.statusText}`);
  }
}
