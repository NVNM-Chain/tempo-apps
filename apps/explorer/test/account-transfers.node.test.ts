import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAccountTransfers } from '#lib/server/token'

const { indexer } = vi.hoisted(() => ({ indexer: vi.fn() }))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-start')>()),
	createServerFn: () => ({
		inputValidator: (validate: (data: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validate(input.data) }),
		}),
	}),
}))

vi.mock('#lib/server/dex-indexer', () => ({ indexer }))
vi.mock('#lib/server/verified-tokens', () => ({
	getTokensMetadata: async () => [],
}))

vi.mock('#wagmi.config.ts', () => ({
	getWagmiConfig: () => ({ state: { chainId: 4217 } }),
}))

const account = '0x286ad6cfc7279c8a6d86d15dcefcb77a65aa7e92'

beforeEach(() => {
	indexer.mockReset()
	indexer.mockImplementation(async (_chainId: number, sql: string) =>
		sql.includes('count()') ? [{ n: 12 }] : [],
	)
})

describe('account transfer direction', () => {
	it.each([
		{
			direction: undefined,
			predicate: `("from" = '${account}' OR "to" = '${account}')`,
		},
		{ direction: 'in' as const, predicate: `"to" = '${account}'` },
		{ direction: 'out' as const, predicate: `"from" = '${account}'` },
	])('requests the $direction feed with its filtered count', async ({
		direction,
		predicate,
	}) => {
		const result = await fetchAccountTransfers({
			data: { account, page: 2, limit: 10, direction },
		})

		// The page and its count read the same one predicate.
		for (const [, sql] of indexer.mock.calls)
			expect(sql).toContain(`WHERE ${predicate}`)
		expect(indexer.mock.calls[0]?.[1]).toContain('LIMIT 10 OFFSET 10')
		expect(result).toEqual({ transfers: [], total: 12, totalCapped: false })
	})
})
