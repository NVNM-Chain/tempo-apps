import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	buildAddressTxMetadata,
	fetchAddressTxMetadata,
	pickTip20CreatedTimestamp,
} from '#lib/server/address-metadata'

const { indexer } = vi.hoisted(() => ({ indexer: vi.fn() }))

vi.mock('#lib/server/dex-indexer', () => ({ indexer }))

beforeEach(() => {
	vi.resetAllMocks()
})

describe('address metadata', () => {
	it('uses the first indexed address activity as creation metadata', () => {
		expect(
			buildAddressTxMetadata({
				count: 3,
				latestTxsBlockTimestamp: 300,
				oldestTxsBlockTimestamp: 100,
				oldestTxHash: '0xoldest',
				oldestTxFrom: '0xsender',
			}),
		).toEqual({
			txCount: 3,
			lastActivityTimestamp: 300,
			createdTimestamp: 100,
			createdTxHash: '0xoldest',
			createdBy: '0xsender',
		})
	})

	it('returns empty activity metadata for a new address', () => {
		expect(buildAddressTxMetadata({ count: 0 })).toEqual({
			txCount: 0,
			lastActivityTimestamp: undefined,
			createdTimestamp: undefined,
			createdTxHash: undefined,
			createdBy: undefined,
		})
	})

	it('loads activity boundaries and count from tidx', async () => {
		indexer.mockImplementation(async (_chainId: number, sql: string) => {
			if (sql.includes('count()')) return [{ n: 3 }]
			return sql.includes('DESC')
				? [{ tx_hash: '0xnewest', from: '0xsender', at: 300 }]
				: [{ tx_hash: '0xoldest', from: '0xsender', at: 100 }]
		})
		const address = '0x1111111111111111111111111111111111111111'
		await expect(fetchAddressTxMetadata(4217, address)).resolves.toEqual({
			count: 3,
			latestTxsBlockTimestamp: 300,
			oldestTxsBlockTimestamp: 100,
			oldestTxHash: '0xoldest',
			oldestTxFrom: '0xsender',
		})

		// An address with no transactions has no receipt at either end.
		indexer.mockImplementation(async (_chainId: number, sql: string) =>
			sql.includes('count()') ? [{ n: 0 }] : [],
		)
		await expect(fetchAddressTxMetadata(4217, address)).resolves.toEqual({
			count: 0,
			latestTxsBlockTimestamp: undefined,
			oldestTxsBlockTimestamp: undefined,
			oldestTxHash: undefined,
			oldestTxFrom: undefined,
		})
	})
})

describe('pickTip20CreatedTimestamp', () => {
	it('prefers the TokenCreated timestamp when present', () => {
		expect(
			pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: '2026-01-02T00:00:00.000Z',
				firstTransferTimestamp: '2026-01-01T00:00:00.000Z',
			}),
		).toBe(Date.parse('2026-01-02T00:00:00.000Z') / 1000)
	})

	it('falls back to the first transfer timestamp', () => {
		expect(
			pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: undefined,
				firstTransferTimestamp: 200,
			}),
		).toBe(200)
		expect(
			pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: null,
				firstTransferTimestamp: null,
			}),
		).toBeUndefined()
	})
})
