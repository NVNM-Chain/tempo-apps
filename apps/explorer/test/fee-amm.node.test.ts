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
	it('puts the most active pools first, then orders by pair', () => {
		const ids = sortFeeAmmPools([
			pool('0xquiet'),
			pool('0xbusy', { mintCount: 9 }),
			pool('0xhigher', { userToken: `0x${'44'.repeat(20)}` }),
			pool('0xdeep', { liquidityUsd: 5 }),
		]).map((p) => p.poolId)
		expect(ids).toEqual(['0xbusy', '0xhigher', '0xquiet', '0xdeep'])
	})
})
