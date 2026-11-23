import { Addresses } from 'viem/tempo'
import { describe, expect, it } from 'vitest'
import { type FeeAmmPool, sortFeeAmmPools } from '#lib/server/fee-amm'

function pool(poolId: string, overrides: Partial<FeeAmmPool> = {}): FeeAmmPool {
	return {
		poolId: poolId as `0x${string}`,
		userToken: `0x${'22'.repeat(20)}`,
		validatorToken: `0x${'33'.repeat(20)}`,
		createdAt: 1,
		latestMintAt: 1,
		mintCount: 1,
		reserveUserToken: 0n,
		reserveValidatorToken: 0n,
		liquidityUsd: 0,
		userTokenName: '',
		userTokenSymbol: '',
		userTokenDecimals: 6,
		validatorTokenName: '',
		validatorTokenSymbol: '',
		validatorTokenDecimals: 6,
		...overrides,
	}
}

describe('sortFeeAmmPools', () => {
	it('puts pathUSD-validator pools first, then the deepest, then the latest', () => {
		const ids = sortFeeAmmPools([
			pool('0xrecent', { latestMintAt: 9 }),
			pool('0xdeep', { liquidityUsd: 5 }),
			pool('0xpathusd', { validatorToken: Addresses.pathUsd }),
			pool('0xold'),
		]).map((p) => p.poolId)
		expect(ids).toEqual(['0xpathusd', '0xdeep', '0xrecent', '0xold'])
	})
})
