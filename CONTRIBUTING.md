# Contributing to unison-ai-sdk

Thanks for helping improve the Vercel AI SDK memory middleware for Unison.

## Repo layout

A single-package TypeScript project built with tsup:

- `src/index.ts` — public API: `unisonMemory` middleware + re-exports
- `src/client.ts` — typed HTTP client: `recall` and `ingestConversation`
- `src/index.test.ts` — unit tests (Vitest)
- `tsup.config.ts` — build configuration (ESM + CJS dual output)

## Development

```bash
npm install
npm run build       # compile to dist/
npm run typecheck   # TypeScript type-check (tsc --noEmit)
npm test            # run all unit tests (vitest run)
```

## Before opening a PR

1. `npm run build` and `npm test` must both pass.
2. Keep changes scoped — one logical change per PR.
3. Add or update a test for every new behavior.
4. Do not commit `.env` or any real credentials.
5. Update `.env.example` if you add new environment variables.

## Conventions

- TypeScript, ESM source, dual ESM + CJS output (tsup).
- No additional runtime dependencies — keep the install footprint minimal.
- The middleware must fail open: if the brain is unreachable or the token is missing, log a warning to stderr and let the model call proceed unmodified.
- The persist step is fire-and-forget — errors are swallowed so they never surface to the caller.
- The client enforces nothing — the Unison backend is the only security boundary. Do not add client-side scope or path checks.

## Reporting bugs / proposing features

Use the issue templates. For security issues, see [`SECURITY.md`](./SECURITY.md) — do **not** open a public issue.
