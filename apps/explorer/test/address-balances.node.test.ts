import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAddressBalancesData } from '#lib/server/address-balances'

const { indexer, getVerifiedTokens, readContract } = vi.hoisted(() => ({
	indexer: vi.fn(),
	getVerifiedTokens: vi.fn(),
	readContract: vi.fn(),
}))

vi.mock('#lib/server/dex-indexer', () => ({ indexer }))
vi.mock('#lib/server/verified-tokens', () => ({
	getVerifiedTokens,
	getTokensMetadata: async (tokens: string[]) =>
		tokens.map(() => ({ currency: 'USD', decimals: 6 })),
}))
vi.mock('#wagmi.config.ts', () => ({
	getBatchedClient: () => ({ readContract }),
	getWagmiConfig: () => ({}),
}))

const ADDRESS = '0x1111111111111111111111111111111111111111'
const token = (n: number) => `0x${n.toString(16).padStart(40, '0')}`
const GENESIS = token(999)

beforeEach(() => {
	vi.resetAllMocks()
	// Two tokens the address once held, both spent.
	indexer.mockResolvedValue([{ token: token(1) }, { token: token(2) }])
	getVerifiedTokens.mockResolvedValue([
		{ address: GENESIS },
		{ address: token(3) },
	])
	readContract.mockImplementation(
		async ({ address }) =>
			({ [GENESIS]: 5n, [token(3)]: 7n })[address as string] ?? 0n,
	)
})

describe('address balances', () => {
	it('caps the funded balances, not the tokens it checks', async () => {
		const { balances } = await fetchAddressBalancesData({
			address: ADDRESS,
			chainId: 1,
			maxTokens: 2,
		})
		expect(balances.map((b) => [b.token, b.balance])).toEqual([
			[token(3), '7'],
			[GENESIS, '5'],
		])

		const { balances: top } = await fetchAddressBalancesData({
			address: ADDRESS,
			chainId: 1,
			maxTokens: 1,
		})
		expect(top.map((b) => b.token)).toEqual([token(3)])
	})
})
