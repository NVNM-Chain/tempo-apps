import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	getTokensMetadata,
	getVerifiedTokens,
} from '#lib/server/verified-tokens'

const { indexer, multicall } = vi.hoisted(() => ({
	indexer: vi.fn(),
	multicall: vi.fn(),
}))

vi.mock('#lib/server/dex-indexer', () => ({ indexer }))
vi.mock('#wagmi.config', () => ({
	getBatchedClient: () => ({ multicall }),
	getWagmiConfig: () => ({}),
}))

type Call = { address: string; functionName: string }

const FIELDS: Record<string, unknown> = {
	name: 'Dollar',
	symbol: 'USDX',
	decimals: 6,
	currency: 'USD',
}

/** Multicall3 answering each call from `read`, a throw being that call's failure. */
function node(
	read: (call: Call) => unknown = (call) => FIELDS[call.functionName],
) {
	multicall.mockImplementation(async ({ contracts }: { contracts: Call[] }) =>
		contracts.map((call) => {
			try {
				return { status: 'success', result: read(call) }
			} catch (error) {
				return { status: 'failure', error }
			}
		}),
	)
}

const tip20 = (n: number) =>
	`0x20c0${n.toString(16).padStart(36, '0')}` as const

beforeEach(() => {
	vi.resetAllMocks()
	node()
})

describe('token metadata', () => {
	it('retries a TIP-20 whose currency read failed', async () => {
		const token = tip20(7)
		node((call) => {
			if (call.functionName === 'currency') throw new Error('fetch failed')
			return FIELDS[call.functionName]
		})
		expect(await getTokensMetadata([token])).toEqual([undefined])
		node()
		expect(await getTokensMetadata([token])).toMatchObject([
			{ currency: 'USD' },
		])
	})

	it('gives an ERC-20 no currency without asking for one', async () => {
		const token = '0x1111111111111111111111111111111111111111'
		expect(await getTokensMetadata([token])).toEqual([
			{ ...FIELDS, currency: '' },
		])
		const asked = multicall.mock.calls.flatMap(([{ contracts }]) =>
			contracts.map((call: Call) => call.functionName),
		)
		expect(asked).not.toContain('currency')
	})

	it('reads every listed token in one Multicall3 call per field', async () => {
		const tokens = Array.from({ length: 200 }, (_, i) => tip20(1_000 + i))
		indexer.mockResolvedValue(
			tokens.map((token, i) => ({ token, holder_count: 200 - i })),
		)
		const listed = await getVerifiedTokens(1)
		expect(listed).toHaveLength(200)
		expect(listed[0]).toMatchObject({ address: tokens[0], holdersCount: 200 })
		expect(multicall).toHaveBeenCalledTimes(4)
		// Cached: a later lookup asks the node nothing.
		await getTokensMetadata(tokens.slice(-1))
		expect(multicall).toHaveBeenCalledTimes(4)
	})
})
