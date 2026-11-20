import { describe, expect, it, vi } from 'vitest'
import {
	type BlockTransaction,
	blockKnownEventsQueryOptions,
} from '#lib/queries/blocks'

const PAID = `0x${'aa'.repeat(32)}` as const
const NO_RECEIPT = `0x${'bb'.repeat(32)}` as const

vi.mock('#wagmi.config.ts', () => ({
	getBatchedClient: () => ({
		getTransactionReceipt: async ({ hash }: { hash: string }) => {
			if (hash !== PAID) throw new Error('no receipt')
			return {
				transactionHash: hash,
				status: 'success',
				effectiveGasPrice: 2_600_000_000n,
				gasUsed: 66_333n,
				logs: [],
			}
		},
		token: { getMetadata: async () => undefined },
	}),
}))

describe('a block’s transaction fees', () => {
	it('come from receipts, not the most each transaction may spend', async () => {
		// `maxFeePerGas` × `gas` would say 0.00134 USD against the 0.000172 paid.
		const transaction = (hash: `0x${string}`) =>
			({
				hash,
				maxFeePerGas: 20_000_000_000n,
				gas: 67_179n,
				input: '0x',
			}) as unknown as BlockTransaction
		const { queryFn } = blockKnownEventsQueryOptions(1n, [
			transaction(PAID),
			transaction(NO_RECEIPT),
		])
		const { fees } = await (
			queryFn as () => Promise<{
				fees: Record<string, bigint>
			}>
		)()
		expect(fees).toEqual({ [PAID]: 66_333n * 2_600_000_000n })
	})
})
