import { describe, expect, it, vi } from 'vitest'
import { indexer } from '#lib/server/dex-indexer'

describe('indexer', () => {
	it('says why the API refused a query', async () => {
		vi.stubGlobal('fetch', async () =>
			Response.json(
				{ error: { code: 'api_key_missing', message: 'Missing API key' } },
				{ status: 401 },
			),
		)
		await expect(indexer(787222, 'SELECT 1')).rejects.toThrow(
			'Indexer query failed (401): Missing API key',
		)
	})
})
