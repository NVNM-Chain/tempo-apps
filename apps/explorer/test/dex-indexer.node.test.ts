import { describe, expect, it, vi } from 'vitest'
import { indexer } from '#lib/server/dex-indexer'

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
