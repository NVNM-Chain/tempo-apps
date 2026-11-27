# NVNMChain Explorer — Full LLM Reference

> Comprehensive reference for agents and AI systems using NVNMChain Explorer.

NVNMChain Explorer is a blockchain explorer for the NVNMChain network. It helps users inspect blocks, transactions, receipts, addresses, contracts, tokens, TIP-403 policies, balances, Fee AMM pools, and on-chain events.

For a shorter overview, see [`/llms.txt`](/llms.txt).

## Networks

Each network has its own deployment. Routes and parameters are the same on every network.

| Network | URL | Redirects from |
| --- | --- | --- |
| nvnm | https://scan.nvnm.canary.mantrachain.dev | - |
| nvnm-testnet | https://scan.nvnm.testnet.nvnmchain.io | - |
| nvnm-mainnet | https://scan.nvnm.mainnet.nvnmchain.io | - |

## Page Routes

{{pages}}

## Public API Routes

API routes return JSON unless noted. Parameters marked required are rejected when missing.

{{api}}

## Common Tasks

### Find an unknown input

Use:

```txt
/api/search?q={input}
```

Then route based on result type:

- `block` → `/block/{blockNumber}`
- `address` → `/address/{address}`
- `token` → `/address/{address}?tab=transfers`
- `transaction` → `/tx/{hash}` or `/receipt/{hash}`

Or open `/search?q={input}`, which redirects to the single match.

### Show an address's balance

Use:

```txt
/address/{address}?tab=holdings
```

### Show an address's recent activity

Use:

```txt
/address/{address}?tab=transactions
```

Optional filters:

```txt
/address/{address}?tab=transactions&status=success
/address/{address}?tab=transactions&period=24h
/address/{address}?tab=transactions&dir=sent
```

### Show a token's holders

Use:

```txt
/address/{tokenAddress}?tab=holders
```

### Show a token's transfers

Use:

```txt
/address/{tokenAddress}?tab=transfers
```

### Show a contract's source or ABI

Use:

```txt
/address/{contractAddress}?tab=contract
```

### Interact with a contract

Use:

```txt
/address/{contractAddress}?tab=interact
```

### Show transaction internals

Use:

```txt
/tx/{hash}?tab=overview
/tx/{hash}?tab=balances
/tx/{hash}?tab=events
/tx/{hash}?tab=trace
/tx/{hash}?tab=raw
```

### Read a receipt as data

Use:

```txt
/receipt/{hash}.json
/receipt/{hash}.txt
```

### Simulate a call before sending it

Use:

```txt
/simulate?from={address}&to={address}&data={calldata}&value={value}
```

## Current Limitations

NVNMChain Explorer currently does not expose top-level network analytics, a top-level transaction list, validator or staking explorer pages, a public token/address verification workflow, or historical contract source diffs.
