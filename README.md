<div align="center">

<img src="https://raw.githubusercontent.com/unison-labs-ai/unison-brain/main/assets/brain.svg" alt="Unison Brain" width="180" />

# @unisonlabs/ai-sdk

### Long-term memory for the Vercel AI SDK, powered by the Unison brain.

[![CI](https://github.com/unison-labs-ai/unison-ai-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/unison-labs-ai/unison-ai-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@unisonlabs/ai-sdk)](https://www.npmjs.com/package/@unisonlabs/ai-sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/unison-labs-ai/unison-ai-sdk?style=social)](https://github.com/unison-labs-ai/unison-ai-sdk)

[**Install**](#install) • [**Quick start**](#quick-start) • [**Options**](#options) • [**Low-level client**](#low-level-client) • [**For agents**](#agents)

</div>

---

> **🤖 Reading this as an AI agent?** See [`AGENTS.md`](./AGENTS.md) — install, auth, and `wrapLanguageModel` usage in one page.

Before each model call, the middleware recalls relevant memories from your Unison brain and injects them into the system prompt. After the call, the user/assistant turn is persisted back so future calls can reference it — giving any LLM durable, cross-session memory with zero boilerplate.

## Install

```bash
npm i @unisonlabs/ai-sdk ai
```

## Quick start

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

The middleware automatically:

1. Calls `GET /v1/brain/context` with the user's latest message before generating.
2. Prepends the recalled `contextMd` to the system prompt (skipped when `weakEvidence` is true).
3. POSTs the user + assistant turn to `POST /v1/brain/ingest` after generating (fire-and-forget).

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `sessionId` | `string` | — | **Required.** Used as `sourceRef` for ingested conversations. |
| `token` | `string` | `UNISON_TOKEN` env var | Your Unison API token (`usk_live_...`). |
| `apiUrl` | `string` | `UNISON_API_URL` or `https://brain.unisonlabs.ai` | Unison brain base URL. |
| `k` | `number` | `5` | Number of memory hits to retrieve. |
| `recall` | `boolean` | `true` | Set to `false` to skip the recall step. |
| `persist` | `boolean` | `true` | Set to `false` to skip the persist step. |

## Environment variables

| Variable | Description |
|---|---|
| `UNISON_TOKEN` | Unison API token. Overridden by `options.token`. |
| `UNISON_API_URL` | Unison brain base URL. Overridden by `options.apiUrl`. |

## Low-level client

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

## Agents

See [`AGENTS.md`](./AGENTS.md) for the full agent onboarding guide: install, auth, `wrapLanguageModel` usage, env vars, and contributor commands.

## Releasing

CI runs on every push and pull request. To publish a new version to npm:

1. Bump the version in `package.json`.
2. Commit and push a tag: `git tag v0.x.y && git push origin v0.x.y`.
3. The `release.yml` workflow triggers automatically, runs `npm publish --access public --provenance`.

**Required repo secret:** `NPM_TOKEN` — set this to an npm Automation token scoped to the `@unisonlabs` org under **Settings → Secrets and variables → Actions**.

## Links

- [Unison Labs](https://unisonlabs.ai)
- [Docs](https://unisonlabs.ai/docs)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [unison-brain repo](https://github.com/unison-labs-ai/unison-brain)
- [Bugs / issues](https://github.com/unison-labs-ai/unison-ai-sdk/issues)

## License

MIT — see [LICENSE](./LICENSE).

---

## Part of the Unison Labs constellation

**One brain, every agent.** Every repo below reads from _and writes to_ the same [Unison brain](https://unisonlabs.ai) — no per-tool memory silos.

| Repo | What it does |
|---|---|
| [unison-brain](https://github.com/unison-labs-ai/unison-brain) | CLI · SDK · MCP server — the core |
| [claude-unison](https://github.com/unison-labs-ai/claude-unison) | Memory for Claude Code |
| [cursor-unison](https://github.com/unison-labs-ai/cursor-unison) | Memory for Cursor |
| [codex-unison](https://github.com/unison-labs-ai/codex-unison) | Memory for OpenAI Codex CLI |
| [opencode-unison](https://github.com/unison-labs-ai/opencode-unison) | Memory for OpenCode |
| [openclaw-unison](https://github.com/unison-labs-ai/openclaw-unison) | Memory for OpenClaw |
| [pipecat-unison](https://github.com/unison-labs-ai/pipecat-unison) | Memory for Pipecat voice agents |
| [langchain-unison](https://github.com/unison-labs-ai/langchain-unison) | LangChain memory, history & retriever |
| [llama-index-memory-unison](https://github.com/unison-labs-ai/llama-index-memory-unison) | LlamaIndex memory provider |
| **[unison-ai-sdk](https://github.com/unison-labs-ai/unison-ai-sdk)** | **Vercel AI SDK memory middleware ← you are here** |
| [unison-mastra](https://github.com/unison-labs-ai/unison-mastra) | Mastra agent memory provider |
| [python-sdk](https://github.com/unison-labs-ai/python-sdk) | Python SDK for the brain |
| [install-mcp](https://github.com/unison-labs-ai/install-mcp) | One-command MCP installer |
| [unison-fs](https://github.com/unison-labs-ai/unison-fs) | Mount the brain as a filesystem |
| [backchannel](https://github.com/unison-labs-ai/backchannel) | Async messaging between agents |
| [Unison-evals](https://github.com/unison-labs-ai/Unison-evals) | Open memory benchmark suite |
