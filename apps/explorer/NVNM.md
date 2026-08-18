# NVNM fork notes

This branch (`nvnm`) turns Tempo's explorer into a **single-chain explorer for
NVNM**. Tempo's own mainnet/testnet/devnet/nextfork are removed, not hidden.

## What changed and why

| Area | Change |
|---|---|
| `src/lib/chains.ts` | Only `nvnmDevnet` (chain **787222**). Spread from viem's `tempoDevnet` so Tempo's block/tx **formatters and serializers** are inherited — our blocks carry `mainBlockGeneralGasLimit`, `sharedGasLimit`, `timestampMillisPart` and transactions use the `0x76` envelope, so a bare `defineChain` would compile and then mis-parse everything. |
| `src/lib/env.ts` | `TempoEnv` is now the single member `'nvnm'`. `normalizeTempoEnv` **throws** on an unrecognised value instead of silently falling back — upstream's fallback turned a typo into an explorer quietly showing another chain's data. |
| `src/wagmi.config.ts` | One chain, and the **browser** RPC target no longer points at `proxy.tempo.xyz`, which has no route for 787222. Miss that and SSR renders correctly while every client-side query 404s after hydration. |
| `src/lib/server/env.ts` | `tempoApiUrl` defaults to our self-hosted tapimo and is overridable via `TEMPO_API_URL`. `api.tempo.xyz` rejects 787222 with `chain_id_unsupported`. |
| `src/lib/server/tempo-queries-provider.ts` | `TIDX_URL` override. The hosted API mounts tidx under `/v1/indexer`; a self-hosted tidx serves `/query` at its root. |
| `src/lib/explorer-network.ts` | Switcher lists NVNM only. |
| `src/lib/explorer-indexing.ts` | NVNM hosts; the internal devnet is `noindex`. |
| `wrangler.json` | Single `env.nvnm`. It **must** declare the `browser` binding: wrangler unions bindings across envs when generating types, and omitting it makes `env.BROWSER` optional, which breaks `routes/_layout/receipt/$hash.tsx`. |
| `package.json`, `scripts/*.sh` | `dev:nvnm` / `deploy:nvnm` only. |

## Running

```bash
pnpm install
pnpm --filter explorer check:types
pnpm --filter explorer dev:nvnm     # NOT `dev` — see below
```

`dev` is an alias for `dev:nvnm` now, but **do not** rely on
`VITE_TEMPO_ENV=… pnpm dev`: the per-env scripts set the variable inline and
override anything from your shell.

## Deploying

The explorer is a Cloudflare Worker and stays one — containerising it would mean
dropping `@cloudflare/vite-plugin` and shimming `env.BROWSER`, four rate-limiter
bindings and `request.cf.asn`.

```bash
pnpm --filter explorer deploy:nvnm
```

Its backing services (tidx, tapimo, Postgres, ClickHouse) are deployed to GKE
from `NVNM-Chain/nvnm-explorer`.

## Rebasing on upstream

Conflicts concentrate in `src/wagmi.config.ts` (upstream edits `getTempoChain`
often) and `wrangler.json` (new upstream envs land in the same object). The rest
is additive or deletion-only.

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` but **excludes** `viem`,
`wagmi`, `accounts`, `tidx.ts` and `@wagmi/core` — those five can move the same
day upstream publishes. Pin them on this branch.

## Version coupling

tapimo `0.6.0` and `0.10.x` configure chains incompatibly, and this explorer's
generated client must agree with the deployed API. Upstream gets that alignment
free by deploying both together; we do not. Pin tidx, tapimo and this branch as
a matched set.
