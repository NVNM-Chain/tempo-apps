# NVNM fork notes

Each build serves **one NVNM chain**: `nvnm` (devnet), `nvnm-testnet`, or
`nvnm-mainnet`. The header links to the separate explorer deployments; it does
not change the chain served by the current deployment.

## What changed and why

| Area | Change |
|---|---|
| `src/lib/chains.ts` | NVNM devnet (**787222**), testnet (**787223**), and mainnet (**7872**). Each inherits Tempo's block/transaction formatters and serializers from viem's `tempoDevnet`. |
| `src/lib/env.ts` | `VITE_TEMPO_ENV` selects the chain at build time. An unrecognised value throws, and the request hostname cannot override the selection. |
| `src/wagmi.config.ts` | Wallets and browser RPC queries use only the selected chain. |
| `src/comps/ConnectWallet.tsx` | The wallet names the selected chain; testnet hides the Fund action because its RPC does not expose `tempo_fundAddress`. |
| `src/lib/account.ts`, `src/lib/domain/contracts.ts` | Testnet uses its nUSD genesis token instead of Tempo's genesis-token labels. |
| `src/routes/api/simulate.ts` | Simulations accept only the selected chain and use its RPC. |
| `src/lib/server/*` | No Tempo API (tapimo), whose npm package ships only the client since 0.21.0: pages read the RPC and tidx. SQL double-quotes `"from"`/`"to"`, as the public indexer's WAF refuses ``SELECT `from` ``. |
| `src/lib/server/tempo-queries-provider.ts` | Testnet uses the indexer's ClickHouse engine by default; its default engine does not respond. |
| `src/lib/explorer-network.ts` | Switcher links to the separate NVNM explorers. |
| `src/lib/explorer-indexing.ts` | NVNM hosts; the internal devnet is `noindex`, mainnet is indexed. |
| `wrangler.json` | A Cloudflare environment per network, each with its own route, indexer setting, rate-limit namespaces, and browser binding. |
| `package.json`, `scripts/*.sh` | `dev:` / `deploy:` per env. |

## Running

```bash
pnpm install
pnpm --filter explorer check:types
pnpm --filter explorer dev:nvnm-testnet
```

Alternatively, set `VITE_TEMPO_ENV=nvnm-testnet` in the environment or
`apps/explorer/.env` and run `pnpm --filter explorer dev`. If unset, the
network defaults to `nvnm`. A local `TIDX_URL` overrides the indexer in the
selected Wrangler environment, so update or remove it when changing networks.

## Deploying

The explorer is a Cloudflare Worker and stays one — containerising it would mean
dropping `@cloudflare/vite-plugin` and shimming `env.BROWSER`, four rate-limiter
bindings and `request.cf.asn`.

```bash
pnpm --filter explorer deploy:nvnm           # scan.nvnm.canary.mantrachain.dev
pnpm --filter explorer deploy:nvnm-testnet   # scan.nvnm.testnet.nvnmchain.io
pnpm --filter explorer deploy:nvnm-mainnet   # scan.nvnm.mainnet.nvnmchain.io
```

Each command builds the selected network before deploying it. You can also use
`VITE_TEMPO_ENV=nvnm-testnet pnpm --filter explorer deploy`. If both
`CLOUDFLARE_ENV` and `VITE_TEMPO_ENV` are set, they must match.

For Cloudflare Workers Builds connected to this repository, use the repository
root as the root directory, set the build variable `CLOUDFLARE_ENV` to the
network (for example `nvnm-testnet`), and configure:

- Build command: `pnpm --filter explorer ci:build`
- Deploy command: `pnpm --filter explorer ci:deploy`

Connect the corresponding Worker (`explorer-nvnm-testnet` for testnet).
Cloudflare applies the network at build time, so rebuild to change it. GitHub
Actions no longer deploys the explorer.

`TIDX_URL` is configured per Worker in `wrangler.json`: testnet uses
`https://indexer.nvnm.testnet.nvnmchain.io`, mainnet uses its public indexer,
and devnet requires an explicit override for its internal indexer.

## Rebasing on upstream

Conflicts concentrate in `src/wagmi.config.ts` (upstream edits `getTempoChain`
often) and `wrangler.json` (new upstream envs land in the same object). The rest
is additive or deletion-only.

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` but **excludes** `viem`,
`wagmi`, `accounts`, `tidx.ts` and `@wagmi/core` — those five can move the same
day upstream publishes. Pin them on this branch.

## Version coupling

The queries name tidx's tables, so pin tidx and this branch as a matched set.
