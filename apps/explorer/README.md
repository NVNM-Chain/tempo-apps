# Tempo Explorer

## Getting Started

To run this application (defaults to NVNM devnet):

```bash
pnpm install
pnpm dev
```

To run NVNM testnet:

```sh
pnpm dev:nvnm-testnet
```

For network selection and Cloudflare Workers Builds configuration, see
[NVNM.md](./NVNM.md).

### Styling

This project uses [Tailwind CSS](https://tailwindcss.com) for styling.

### Linting, Formatting & Type Checking

This project uses [Biome](https://biomejs.dev) for linting and formatting.

To format & lint:

```bash
pnpm check
```

To check types:

```bash
pnpm check:types
```

## Adding new features

When adding new features, please read TanStack Router and Start docs first.

[TanStack Router](https://tanstack.com/router/latest/docs)
[TanStack Start](https://tanstack.com/start/latest/docs)
