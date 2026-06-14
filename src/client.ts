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
