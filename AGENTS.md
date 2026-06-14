# AGENTS.md

Guidance for AI agents. This file covers two jobs — jump to yours:

- **Use unison-ai-sdk** — you're an agent helping someone wire Unison memory into the Vercel AI SDK
- **Contribute to this repo** — you're changing this middleware's code

Follows the [AGENTS.md](https://agents.md/) convention. Human contributors: see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Use unison-ai-sdk

### What it does

`@unisonlabs/ai-sdk` is a Vercel AI SDK [`LanguageModelV1Middleware`](https://sdk.vercel.ai/docs/ai-sdk-core/middleware) that gives any model durable, cross-session memory backed by the Unison brain:

| Step | When | What it does |
|---|---|---|
| **Recall** | Before each model call | Calls `GET /v1/brain/context` with the latest user message; prepends the returned `contextMd` to the system prompt |
| **Persist** | After each model call | Posts the user + assistant turn to `POST /v1/brain/ingest` (fire-and-forget) |

Memory is stored under `/private/sessions/<sessionId>.md` in the Unison brain and scoped to the token's workspace, so context never leaks across users.

### Install

```bash
npm i @unisonlabs/ai-sdk ai
```

### Authenticate

Set your Unison API token before running:

```bash
export UNISON_TOKEN="usk_live_..."
```

**Headless / CI (no browser) — provision an account:**

```bash
curl -X POST https://brain.unisonlabs.ai/v1/auth/provision \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
# Returns: {"apiKey":"usk_live_...","workspaceId":"..."}

export UNISON_TOKEN="usk_live_..."
```

**Override the API base URL** (e.g. for a self-hosted brain):

```bash
export UNISON_API_URL="http://localhost:4001"
export UNISON_TOKEN="usk_live_..."
```

### Usage

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText, wrapLanguageModel } from 'ai';
import { unisonMemory } from '@unisonlabs/ai-sdk';

const model = wrapLanguageModel({
  model: openai('gpt-4o'),
  middleware: unisonMemory({ sessionId: 'user-123' }),
});

const { text } = await generateText({
  model,
  prompt: 'What projects am I currently working on?',
});

console.log(text);
```

The middleware wires into any `LanguageModelV1`-compatible model — OpenAI, Anthropic, Google, Mistral, or any other provider the AI SDK supports.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `sessionId` | `string` | — | **Required.** Identifies the conversation for ingestion. |
| `token` | `string` | `UNISON_TOKEN` env var | Your Unison API token (`usk_live_...`). |
| `apiUrl` | `string` | `UNISON_API_URL` or `https://brain.unisonlabs.ai` | Unison brain base URL. |
| `k` | `number` | `5` | Number of memory hits to retrieve per call. |
| `recall` | `boolean` | `true` | Set to `false` to skip the recall step. |
| `persist` | `boolean` | `true` | Set to `false` to skip the persist step. |

### Environment variables

| Variable | Description |
|---|---|
| `UNISON_TOKEN` | Unison API token. Takes precedence over everything; overridden only by `options.token`. |
| `UNISON_API_URL` | Unison brain base URL. Defaults to `https://brain.unisonlabs.ai`. |

### Low-level client

```typescript
import { recall, ingestConversation } from '@unisonlabs/ai-sdk';

const result = await recall({
  apiUrl: 'https://brain.unisonlabs.ai',
  token: process.env.UNISON_TOKEN!,
  q: 'What are my ongoing projects?',
  k: 5,
});

if (!result.weakEvidence) {
  console.log(result.contextMd);
}

await ingestConversation({
  apiUrl: 'https://brain.unisonlabs.ai',
  token: process.env.UNISON_TOKEN!,
  sessionId: 'user-123',
  turns: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi! How can I help?' },
  ],
});
```

---

## Contributing to this repo

Single-package TypeScript project built with tsup. Source in `src/`, tests in `src/index.test.ts`.

### Build, test, typecheck

```bash
npm install
npm run build       # compile src/ → dist/ with tsup
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

CI runs all three. All must pass before merging.

### Key conventions

- No additional runtime dependencies. Keep the install footprint minimal.
- The middleware must be tolerant: if the brain is unreachable or `UNISON_TOKEN` is missing, fall through without throwing — never break an AI SDK call.
- The persist step is fire-and-forget (swallowed errors); the recall step fails open (returns no context on error).
- The client enforces nothing. The Unison backend is the only security boundary. Do not add client-side scope checks or path allow-lists.

### PRs

One logical change per PR. Add or update a test for every new behavior. Run `npm run build && npm test` before pushing. Security issues: see [`SECURITY.md`](./SECURITY.md).
