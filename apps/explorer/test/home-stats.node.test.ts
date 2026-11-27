import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchHomeStats, HOME_MINUTES } from '#lib/server/home'

const { indexer, readBlockNumber, getCode } = vi.hoisted(() => ({
	indexer: vi.fn(),
	readBlockNumber: vi.fn(),
	getCode: vi.fn(),
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
vi.mock('#lib/server/block-number', () => ({ readBlockNumber }))
vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({ state: { chainId: 31318 } }),
	getBatchedClient: () => ({ getCode }),
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

let clock = Date.now()
/** Moves the clock past any use of the last snapshot. */
function later() {
	clock += 3_600_000
	vi.setSystemTime(clock)
}

beforeEach(() => {
	vi.resetAllMocks()
	later()
	indexer.mockImplementation(async (_chainId: number, sql: string) =>
		answer(sql),
	)
	readBlockNumber.mockResolvedValue(101n)
	getCode.mockResolvedValue('0xef')
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
		// Both windows end at the newest block read first, block 100.
		expect(indexer).toHaveBeenCalledWith(
			31318,
			expect.stringMatching(
				/AS txs FROM txs FINAL\s+WHERE block_num >= 40 AND block_num <= 100 /,
			),
		)
		expect(indexer).toHaveBeenCalledWith(
			31318,
			expect.stringMatching(/FROM blocks WHERE .* AND num <= 100\s/),
		)
	})

	it('flags an index whose newest block the head has left behind', async () => {
		// The newest indexed block is block 100, at 10_000 s.
		expect((await fetchHomeStats()).indexStaleSince).toBe(10_000)
		readBlockNumber.mockResolvedValue(100n)
		later()
		expect((await fetchHomeStats()).indexStaleSince).toBeNull()
	})

	it('answers polls from the last snapshot, also while one poll reloads it', async () => {
		const loads = () =>
			indexer.mock.calls.filter(([, sql]) => sql.includes('max(num)')).length
		const first = await fetchHomeStats()
		vi.setSystemTime(clock + 1_999)
		expect(await fetchHomeStats()).toBe(first)
		expect(loads()).toBe(1)

		// Two seconds old: one poll reloads it, and the next does not wait for that.
		vi.setSystemTime(clock + 2_000)
		const head = Promise.withResolvers<bigint>()
		readBlockNumber.mockReturnValue(head.promise)
		const reload = fetchHomeStats()
		expect(await fetchHomeStats()).toBe(first)
		expect(loads()).toBe(2)
		head.resolve(101n)
		expect(await reload).not.toBe(first)
		expect(await fetchHomeStats()).toBe(await reload)
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

	it('takes its example from the newest successful call to a contract', async () => {
		expect((await fetchHomeStats()).example).toMatchObject({ hash: TX })
		expect(getCode).toHaveBeenCalledExactlyOnceWith({ address: TOKEN })

		// Without code the recipient is an account, whatever it was sent.
		getCode.mockResolvedValue('0x')
		later()
		expect((await fetchHomeStats()).example).toBeUndefined()
	})
})
