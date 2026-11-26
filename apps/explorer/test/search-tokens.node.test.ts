import { describe, expect, it, vi } from 'vitest'
import { searchKnownContracts, searchTokens } from '../src/routes/api/search.ts'

describe('searchKnownContracts', () => {
	it('ranks the V2 validator contract before the legacy V1 contract', () => {
		const results = searchKnownContracts('validator config')

		expect(results.slice(0, 2).map(({ label }) => label)).toEqual([
			'Validator Config',
			'Validator Config V1 (legacy)',
		])
	})

	it('searches testnet genesis tokens without listing Tempo-only tokens', async () => {
		vi.stubEnv('VITE_TEMPO_ENV', 'nvnm-testnet')
		vi.resetModules()
		try {
			const { searchKnownContracts } = await import(
				'../src/routes/api/search.ts'
			)
			expect(searchKnownContracts('nUSD')).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						address: '0x20C0000000000000000000000000000000000000',
						label: 'nUSD',
					}),
				]),
			)
			expect(searchKnownContracts('AlphaUSD')).toEqual([])
		} finally {
			vi.unstubAllEnvs()
			vi.resetModules()
		}
	})
})

describe('searchTokens', () => {
	it('finds verified tokens missing from the static index by symbol', () => {
		expect(
			searchTokens('BRLA', [
				{
					address: '0x20c000000000000000000000f047dd7018e50367',
					name: 'BRLA Token',
					symbol: 'BRLA',
				},
			]),
		).toEqual([
			{
				type: 'token',
				address: '0x20c000000000000000000000f047dd7018e50367',
				symbol: 'BRLA',
				name: 'BRLA Token',
				isTip20: true,
			},
		])
	})
})
