import { describe, expect, it } from 'vitest'
import { PriceFormatter } from '#lib/formatting'

describe('gas amounts in USD', () => {
	it('prices gas per million', () => {
		expect(PriceFormatter.formatGasPrice(2_600_000_000n)).toBe(
			'0.0026 USD / 1M gas',
		)
		expect(PriceFormatter.formatGasPrice(0n)).toBe('0 USD / 1M gas')
	})

	it('reads a gas cost at 18 decimals, not the chain’s native 6', () => {
		expect(PriceFormatter.formatGasCost(66_333n * 2_600_000_000n)).toBe(
			'0.000172 USD',
		)
	})
})
