import { beforeAll, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	create: vi.fn(() => ({
		on: vi.fn(),
	})),
	from: vi.fn(),
}))

vi.mock('tidx.ts', () => ({
	QB: { from: mocks.from },
	Tidx: { create: mocks.create },
}))

vi.mock('#lib/server/env', () => ({
	serverEnv: { TIDX_URL: 'https://indexer.example' },
}))

describe('Tempo query provider', () => {
	let provider: typeof import('#lib/server/tempo-queries-provider')

	beforeAll(async () => {
		provider = await import('#lib/server/tempo-queries-provider')
	})

	it('queries the configured tidx', () => {
		expect(mocks.create).toHaveBeenCalledWith({
			baseUrl: 'https://indexer.example',
		})
	})

	it('forwards the query engine', () => {
		provider.tempoQueryBuilder(4217, { engine: 'clickhouse' })

		expect(mocks.from).toHaveBeenCalledWith(
			expect.objectContaining({ chainId: 4217, engine: 'clickhouse' }),
		)
	})
})
