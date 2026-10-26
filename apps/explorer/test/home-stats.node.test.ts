import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchHomeStats, HOME_MINUTES } from '#lib/server/home'

const { indexer, getBlockNumber } = vi.hoisted(() => ({
	indexer: vi.fn(),
	getBlockNumber: vi.fn(),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-start')>()),
	createServerFn: () => {
		const fn = {
			handler: (handler: () => unknown) => handler,
			inputValidator: () => fn,
		}
		return fn
	},
}))
vi.mock('#lib/server/dex-indexer', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/dex-indexer')>()),
	indexer,
}))
vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({ state: { chainId: 31318 } }),
	getBatchedClient: () => ({ getBlockNumber }),
}))

const TX = `0x${'ab'.repeat(32)}`
const FAILED = `0x${'cd'.repeat(32)}`
const FROM = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x20c0000000000000000000000000000000000000'

/** Answers each query by the table and shape it asks for. */
function answer(sql: string) {
	if (sql.includes('max(num)')) return [{ num: 100, at: 10_000, n: 101 }]
	if (sql.includes('FROM blocks WHERE toUnixTimestamp'))
		return [
			{
				minute: 0,
				blocks: 2,
				gas: 30,
				gas_limit: 200,
				first_ms: 6_400_000,
				last_ms: 6_401_000,
				first_num: 40,
			},
			{
				minute: 59,
				blocks: 1,
				gas: 10,
				gas_limit: 100,
				first_ms: 6_402_000,
				last_ms: 6_402_000,
				first_num: 100,
			},
		]
	if (sql.includes('AS txs FROM txs')) return [{ minute: 59, txs: 4 }]
	if (sql.includes('GROUP BY block_num')) return [{ block_num: 100, n: 4 }]
	if (sql.includes('count() AS n FROM txs')) return [{ n: 84 }]
	if (sql.includes('token_holder_counts')) return [{ n: 2 }]
	if (sql.includes('ORDER BY num DESC'))
		return [
			{
				num: 100,
				hash: `0x${'01'.repeat(32)}`,
				at: 10_000,
				gas_used: 10,
				gas_limit: 100,
			},
		]
	if (sql.includes('ORDER BY block_num DESC'))
		return [
			{
				hash: TX,
				block_num: 100,
				at: 10_000,
				from: FROM,
				to: TOKEN,
				input: '0xa9059cbb',
			},
			{
				hash: FAILED,
				block_num: 99,
				at: 9_999,
				from: FROM,
				to: null,
				input: '0x',
			},
		]
	if (sql.includes('FROM receipts'))
		return [
			{ tx_hash: FAILED, status: 0 },
			{ tx_hash: TX, status: 1 },
		]
	throw new Error(`unexpected query: ${sql}`)
}

beforeEach(() => {
	vi.resetAllMocks()
	indexer.mockImplementation(async (_chainId: number, sql: string) =>
		answer(sql),
	)
	getBlockNumber.mockResolvedValue(101n)
})

describe('home stats', () => {
	it('averages the hour before the newest block', async () => {
		const stats = await fetchHomeStats()
		expect(stats).toMatchObject({
			head: 101,
			indexed: 101,
			latestBlock: 100,
			// Three blocks over 2 s; four transactions over the same span.
			blockTimeMs: 1_000,
			tps: 2,
			gasUtilization: (40 * 100) / 300,
			totalTxns: 84,
			tokens: 2,
		})
		expect(stats.txPerMinute).toHaveLength(HOME_MINUTES)
		expect(stats.txPerMinute[59]).toBe(4)
		expect(stats.gasPerMinute[0]).toBe(30)
		expect(indexer).toHaveBeenCalledWith(
			31318,
			expect.stringMatching(/AS txs FROM txs\s+WHERE block_num >= 40 /),
		)
	})

	it('names calls, counts each block’s transactions and marks failures', async () => {
		const { blocks, transactions } = await fetchHomeStats()
		expect(blocks).toEqual([expect.objectContaining({ number: 100, txns: 4 })])
		expect(transactions).toEqual([
			expect.objectContaining({ hash: TX, method: 'transfer', failed: false }),
			expect.objectContaining({
				hash: FAILED,
				method: null,
				to: null,
				failed: true,
			}),
		])
	})
})
