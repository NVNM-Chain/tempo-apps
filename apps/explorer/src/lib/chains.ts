import { defineChain } from 'viem'
import { tempoDevnet as tempoDevnet_ } from 'viem/chains'
import type { TempoEnv } from './env'

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
	blockExplorers: {
		default: {
			name: 'NVNM Devnet Explorer',
			url: 'https://scan.nvnm.canary.mantrachain.dev',
		},
	},
	// nvnm-genesis/genesis.json
	feeToken: '0x20c0000000000000000000000000000000000000',
	testnet: true,
})

export const nvnmTestnet = defineChain({
	...tempoDevnet_,
	id: 787223,
	name: 'NVNM Testnet',
	rpcUrls: {
		default: {
			http: ['https://rpc.nvnm.testnet.nvnmchain.io'],
			webSocket: ['wss://rpc.nvnm.testnet.nvnmchain.io'],
		},
	},
	blockExplorers: {
		default: {
			name: 'NVNM Testnet Explorer',
			url: 'https://scan.nvnm.testnet.nvnmchain.io',
		},
	},
	feeToken: '0x20c0000000000000000000000000000000000000',
	testnet: true,
})

/** nvnm-mainnet, EVM chain id 7872; spread from `tempoDevnet_` as {@link nvnmDevnet} is. */
export const nvnmMainnet = defineChain({
	...tempoDevnet_,
	id: 7872,
	name: 'NVNM Mainnet',
	rpcUrls: {
		default: {
			http: ['https://rpc.nvnm.mainnet.nvnmchain.io'],
			webSocket: ['wss://rpc.nvnm.mainnet.nvnmchain.io'],
		},
	},
	blockExplorers: {
		default: {
			name: 'NVNM Mainnet Explorer',
			url: 'https://scan.nvnm.mainnet.nvnmchain.io',
		},
	},
	// nvnm-mainnet's genesis holds this one TIP-20.
	feeToken: '0x20c0000000000000000000000000000000000000',
	testnet: false,
})

/** The chain each deployment serves. */
export const nvnmChainByEnv = {
	nvnm: nvnmDevnet,
	'nvnm-testnet': nvnmTestnet,
	'nvnm-mainnet': nvnmMainnet,
} as const satisfies Record<TempoEnv, unknown>
