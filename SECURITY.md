# Security Policy

## Reporting a vulnerability

Please report security issues privately — **do not open a public GitHub issue.**

Email **security@unisonlabs.ai** with:

- a description of the issue and its impact,
- steps to reproduce (a proof-of-concept if you have one),
- any suggested remediation.

We aim to acknowledge within 3 business days and to keep you updated as we
investigate. We'll credit reporters who want it once a fix ships.

## Scope

This repository is the **open-source Vercel AI SDK middleware** for the Unison brain.
It holds no secrets and is not a security boundary — all authentication,
authorization, workspace isolation, and rate limiting are enforced **server-side** by
the Unison brain API. Reports about the client are most useful when they concern:

- handling of `UNISON_TOKEN` in process environment or on disk,
- how the token is transmitted to `UNISON_API_URL` (e.g. unexpected logging or forwarding),
- dependency or supply-chain risks.

Server-side or account issues should also go to the same address.

## Handling of credentials

The middleware reads the bearer token (`usk_...`) from the `UNISON_TOKEN` environment
variable or from the `token` option passed directly to `unisonMemory()`. The token is
never logged or transmitted anywhere except the configured `UNISON_API_URL` host.
