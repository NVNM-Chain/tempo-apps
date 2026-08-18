import { defineChain } from 'viem'
import { tempoDevnet as tempoDevnet_ } from 'viem/chains'

/**
 * nvnm-tempo-devnet-1 — MANTRA's fork of Tempo v1.12.0. EVM chain id 787222.
 *
 * Spread from `tempoDevnet_` so the chain inherits Tempo's block and
 * transaction `formatters`/`serializers`. Our blocks carry
 * `mainBlockGeneralGasLimit`, `sharedGasLimit` and `timestampMillisPart`, and
 * transactions use the 0x76 envelope — a bare `defineChain` compiles fine and
 * then mis-parses every block and transaction.
 *
 * `webSocket` is not optional: routes/_layout/blocks.tsx reads
 * `rpcUrls.default.webSocket[0]` and the live block feed silently stops
 * without it.
 */
export const nvnmDevnet = defineChain({
	...tempoDevnet_,
	id: 787222,
	name: 'NVNM Tempo Devnet',
	rpcUrls: {
		default: {
			http: ['https://rpc.nvnm.canary.mantrachain.dev'],
			webSocket: ['wss://ws.nvnm.canary.mantrachain.dev'],
		},
	},
	// nvnm-genesis/genesis.json
	feeToken: '0x20c0000000000000000000000000000000000000',
	testnet: true,
})

/**
 * Every chain this explorer serves.
 *
 * Tempo's own mainnet/testnet/devnet/nextfork are deliberately absent: this
 * build is for NVNM chains only, and the hosted api.tempo.xyz does not serve
 * chain 787222 anyway.
 */
export const nvnmChains = [nvnmDevnet] as const
