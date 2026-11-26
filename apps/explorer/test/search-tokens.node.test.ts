import { describe, expect, it } from 'vitest'
import { searchKnownContracts, searchTokens } from '../src/routes/api/search.ts'

describe('searchKnownContracts', () => {
	it('ranks the V2 validator contract before the legacy V1 contract', () => {
		const results = searchKnownContracts('validator config')

		expect(results.slice(0, 2).map(({ label }) => label)).toEqual([
			'Validator Config',
			'Validator Config V1 (legacy)',
		])
	})

	it('searches the genesis token without listing Tempo-only tokens', () => {
		expect(searchKnownContracts('nUSD')).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					address: '0x20C0000000000000000000000000000000000000',
					label: 'nUSD',
				}),
			]),
		)
		expect(searchKnownContracts('AlphaUSD')).toEqual([])
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
