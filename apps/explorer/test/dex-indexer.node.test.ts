import { describe, expect, it, vi } from 'vitest'
import { distinct, indexer } from '#lib/server/dex-indexer'

vi.mock('#lib/server/tempo-queries-provider', () => ({
	indexerUrl: 'http://tidx.test',
}))

describe('indexer', () => {
	it('says why tidx refused a query', async () => {
		const error = "Access to ClickHouse system schema 'system' is not allowed"
		vi.stubGlobal('fetch', async () =>
			Response.json({ ok: false, error }, { status: 422 }),
		)
		await expect(indexer(787222, 'SELECT 1')).rejects.toThrow(
			`Indexer query failed (422): ${error}`,
		)
	})
})

describe('distinct', () => {
	it('keeps the first row of each key', () => {
		const rows = [
			{ block_num: 9, tx_idx: 1, n: 'a' },
			{ block_num: 9, tx_idx: 1, n: 'b' },
			{ block_num: 9, tx_idx: 2, n: 'c' },
		]
		expect(distinct(rows, 'block_num', 'tx_idx').map((row) => row.n)).toEqual([
			'a',
			'c',
		])
	})
})
