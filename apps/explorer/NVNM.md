# NVNM fork notes

This branch (`nvnm`) turns Tempo's explorer into an explorer for **one NVNM
chain per deployment**: `nvnm` (devnet) or `nvnm-mainnet`. Tempo's own
mainnet/testnet/devnet/nextfork are removed, not hidden.

## What changed and why

| Area | Change |
|---|---|
| `src/lib/chains.ts` | `nvnmDevnet` (chain **787222**) and `nvnmMainnet` (**7872**). Spread from viem's `tempoDevnet` so Tempo's block/tx **formatters and serializers** are inherited — our blocks carry `mainBlockGeneralGasLimit`, `sharedGasLimit`, `timestampMillisPart` and transactions use the `0x76` envelope, so a bare `defineChain` would compile and then mis-parse everything. |
| `src/lib/env.ts` | `TempoEnv` is `'nvnm' \| 'nvnm-mainnet'`. `normalizeTempoEnv` **throws** on an unrecognised value instead of silently falling back — upstream's fallback turned a typo into an explorer quietly showing another chain's data. |
| `src/wagmi.config.ts` | The env's one chain, and the **browser** RPC target is that chain's RPC, not `proxy.tempo.xyz`, which has no route for NVNM chains. Miss that and SSR renders correctly while every client-side query 404s after hydration. |
| `src/lib/server/*` | No Tempo API (tapimo), whose npm package ships only the client since 0.21.0: pages read the RPC and tidx. SQL double-quotes `"from"`/`"to"`, as the public indexer's WAF refuses ``SELECT `from` ``. |
| `src/lib/explorer-network.ts` | Switcher lists NVNM only. |
| `src/lib/explorer-indexing.ts` | NVNM hosts; the internal devnet is `noindex`, mainnet is indexed. |
| `wrangler.json` | `env.nvnm` and `env.nvnm-mainnet`, each with its own rate-limit namespaces. Each env **must** declare the `browser` binding: wrangler unions bindings across envs when generating types, and omitting it makes `env.BROWSER` optional, which breaks `routes/_layout/receipt/$hash.tsx`. |
| `package.json`, `scripts/*.sh` | `dev:` / `deploy:` per env. |

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
pnpm --filter explorer deploy:nvnm           # scan.nvnm.canary.mantrachain.dev
pnpm --filter explorer deploy:nvnm-mainnet   # scan.nvnm.mainnet.nvnmchain.io
```

`TIDX_URL`, the only server setting, is the chain's tidx, deployed to GKE from
`NVNM-Chain/nvnm-indexer`. Mainnet's is the public
`indexer.nvnm.mainnet.nvnmchain.io`, set in `wrangler.json`; the devnet's indexer
is internal, so its env sets none.

## Rebasing on upstream

Conflicts concentrate in `src/wagmi.config.ts` (upstream edits `getTempoChain`
often) and `wrangler.json` (new upstream envs land in the same object). The rest
is additive or deletion-only.

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` but **excludes** `viem`,
`wagmi`, `accounts`, `tidx.ts` and `@wagmi/core` — those five can move the same
day upstream publishes. Pin them on this branch.

## Version coupling

The queries name tidx's tables, so pin tidx and this branch as a matched set.
