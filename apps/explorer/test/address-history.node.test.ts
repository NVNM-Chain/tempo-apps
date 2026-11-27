import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	fetchAddressHistoryData,
	toEnrichedTransaction,
} from '#lib/server/address-history'

const { indexer, getTransaction, getTransactionReceipt } = vi.hoisted(() => ({
	indexer: vi.fn(),
	getTransaction: vi.fn(),
	getTransactionReceipt: vi.fn(),
}))

vi.mock('#lib/server/dex-indexer', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/dex-indexer')>()),
	indexer,
}))
vi.mock('#wagmi.config', () => ({
	getBatchedClient: () => ({ getTransaction, getTransactionReceipt }),
	getTempoChain: () => ({ id: 787222 }),
}))

const SENDER = '0x286ad6cfc7279c8a6d86d15dcefcb77a65aa7e92'
const RECIPIENT = '0x20c0000000000000000000000000000000000003'
const HASH =
	'0x220935cf5b098cbea4d2b2a72ed3e156ad872743c593869d0223a9b93f06dd48'

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		transactionHash: HASH,
		blockNumber: 21_846_856n,
		contractAddress: null,
		effectiveGasPrice: 20_000_000_000n,
		from: SENDER,
		gasUsed: 52_570n,
		logs: [],
		status: 'success',
		to: RECIPIENT,
		...overrides,
	} as never
}

const transaction = { hash: HASH, input: '0x', value: 12_345n } as never

/** Answers the page query with `rows` and the count query with `total`. */
function answer(rows: Record<string, unknown>[], total = 0) {
	indexer.mockImplementation(async (_chainId: number, sql: string) =>
		sql.includes('count()') ? [{ n: total }] : rows,
	)
}

const ADDRESS = '0x1111111111111111111111111111111111111111'

beforeEach(() => {
	vi.resetAllMocks()
	getTransaction.mockResolvedValue(transaction)
	getTransactionReceipt.mockImplementation(async ({ hash }) =>
		receipt({ transactionHash: hash }),
	)
})

describe('toEnrichedTransaction', () => {
	it('maps the node’s transaction and receipt to the UI contract', () => {
		expect(
			toEnrichedTransaction(transaction, receipt(), {
				timestamp: 1_781_236_700,
				includeKnownEvents: false,
				getTokenMetadata: () => undefined,
			}),
		).toEqual({
			hash: HASH,
			blockNumber: '0x14d5b48',
			timestamp: 1_781_236_700,
			from: '0x286ad6cfc7279C8a6D86D15dcEFcB77A65Aa7E92',
			to: '0x20C0000000000000000000000000000000000003',
			value: '0x3039',
			status: 'success',
			gasUsed: '0xcd5a',
			effectiveGasPrice: '0x4a817c800',
			knownEvents: [],
		})
	})

	it('marks reverted transactions from the receipt status', () => {
		const result = toEnrichedTransaction(
			transaction,
			receipt({ status: 'reverted' }),
			{
				timestamp: 0,
				includeKnownEvents: false,
				getTokenMetadata: () => undefined,
			},
		)

		expect(result.status).toBe('reverted')
	})
})

describe('fetchAddressHistoryData', () => {
	it('rejects page sizes above 10', async () => {
		await expect(
			fetchAddressHistoryData({
				address: ADDRESS,
				chainId: 4217,
				includeKnownEvents: false,
				searchParams: { include: 'all', limit: 11, sort: 'desc' },
			}),
		).rejects.toThrowError('Limit is too high')
		expect(indexer).not.toHaveBeenCalled()
	})

	it('counts at the latest edge and reuses the count on cursor pages', async () => {
		// One row past the page says there is another.
		answer(
			[
				{ tx_hash: HASH, block_num: 9, tx_idx: 1, timestamp: 1 },
				{ tx_hash: HASH, block_num: 8, tx_idx: 0, timestamp: 1 },
			],
			1_750,
		)
		const params = {
			address: ADDRESS,
			chainId: 4217,
			includeKnownEvents: false,
			searchParams: {
				include: 'all' as const,
				limit: 1,
				sort: 'desc' as const,
			},
		}

		const first = await fetchAddressHistoryData(params)
		expect(first).toMatchObject({ total: 1_750, countCapped: false })
		expect(first.transactions).toHaveLength(1)
		expect(first.nextCursor).toBe(btoa('[9,1]'))

		answer([{ tx_hash: HASH, block_num: 8, tx_idx: 0, timestamp: 1 }])
		await expect(
			fetchAddressHistoryData({
				...params,
				searchParams: {
					...params.searchParams,
					cursor: first.nextCursor ?? '',
				},
			}),
		).resolves.toMatchObject({ total: 1_750, nextCursor: null })

		const queries = indexer.mock.calls.map(([, sql]) => sql as string)
		// Counted once, as stored and then without copies.
		expect(
			queries
				.filter((sql) => sql.includes('count()'))
				.map((sql) => sql.includes('FINAL')),
		).toEqual([false, true])
		expect(queries.at(-1)).toContain('(block_num, tx_idx) < (9, 1)')
	})

	it.each([
		['ends where the history does', [], null],
		['pages on past the duplicate', [{ block_num: 7, tx_idx: 0 }], '[8,0]'],
	])('lists a transaction tidx holds twice once and %s', async (_, after, next) => {
		const [a, b] = [
			{ tx_hash: HASH, block_num: 9, tx_idx: 1, timestamp: 1 },
			{ tx_hash: HASH, block_num: 8, tx_idx: 0, timestamp: 1 },
		]
		// The first batch is [A, A, B]; what follows B is `after`.
		indexer.mockImplementation(async (_chainId: number, sql: string) =>
			sql.includes('count()')
				? [{ n: 0 }]
				: sql.includes('< (8, 0)')
					? after.map((row) => ({ tx_hash: HASH, timestamp: 1, ...row }))
					: [a, a, b],
		)

		const first = await fetchAddressHistoryData({
			address: ADDRESS,
			chainId: 4217,
			includeKnownEvents: false,
			searchParams: { include: 'all', limit: 2, sort: 'desc' },
		})

		expect(first.transactions).toHaveLength(2)
		expect(first.nextCursor).toBe(next && btoa(next))
	})

	it.each([
		['leaves tidx’s copies out of a short history’s total', 40, 20, 20],
		['keeps them when the recount fails', 41, undefined, 41],
		['keeps them in one too long to recount', 200_000, 199_940, 200_000],
	])('%s', async (_, stored, exact, total) => {
		indexer.mockImplementation(async (_chainId: number, sql: string) => {
			if (!sql.includes('count()')) return []
			if (!sql.includes('FINAL')) return [{ n: stored }]
			if (exact === undefined) throw new Error('Indexer query failed (422)')
			return [{ n: exact }]
		})

		await expect(
			fetchAddressHistoryData({
				// Totals are cached by address.
				address: `0x${String(stored).padStart(40, '3')}`,
				chainId: 4217,
				includeKnownEvents: false,
				searchParams: { include: 'all', limit: 10, sort: 'desc' },
			}),
		).resolves.toMatchObject({ total })
	})

	it('fetches and reverses the oldest edge without counting', async () => {
		const olderHash = `0x${'1'.repeat(64)}`
		const oldestHash = `0x${'2'.repeat(64)}`
		answer([
			{ tx_hash: oldestHash, block_num: 1, tx_idx: 0, timestamp: 1 },
			{ tx_hash: olderHash, block_num: 2, tx_idx: 0, timestamp: 2 },
		])

		await expect(
			fetchAddressHistoryData({
				address: '0x2222222222222222222222222222222222222222',
				chainId: 4217,
				includeKnownEvents: false,
				searchParams: { include: 'all', limit: 10, sort: 'asc' },
			}),
		).resolves.toEqual({
			countCapped: false,
			error: null,
			limit: 10,
			nextCursor: null,
			reverseCursor: 'WzEsMF0=',
			total: null,
			transactions: [
				expect.objectContaining({ hash: olderHash }),
				expect.objectContaining({ hash: oldestHash }),
			],
		})

		expect(indexer).toHaveBeenCalledOnce()
		expect(indexer.mock.calls[0]?.[1]).toContain(
			'ORDER BY block_num ASC, tx_idx ASC',
		)
	})
})
