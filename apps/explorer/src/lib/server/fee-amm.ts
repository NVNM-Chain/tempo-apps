import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { formatUnits, getAbiItem, toEventSelector } from 'viem'
import { Addresses } from 'viem/tempo'
import { getChainId } from 'wagmi/actions'
import { Abis } from '#lib/abis'
import { indexer } from '#lib/server/dex-indexer'
import { getTokensMetadata } from '#lib/server/verified-tokens'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config'

export type FeeAmmPool = {
	poolId: `0x${string}`
	userToken: Address.Address
	validatorToken: Address.Address
	createdAt: number | null
	latestMintAt: number | null
	mintCount: number
	reserveUserToken: bigint
	reserveValidatorToken: bigint
	liquidityUsd: number
	userTokenSymbol: string
	userTokenName: string
	userTokenDecimals: number
	validatorTokenSymbol: string
	validatorTokenName: string
	validatorTokenDecimals: number
}

/** Max number of pools the page shows. */
const POOL_LIMIT = 50

const MINT = toEventSelector(getAbiItem({ abi: Abis.feeAmm, name: 'Mint' }))

/** pathUSD-validator pools first, then by liquidity, then by most recent activity. */
export function sortFeeAmmPools(pools: FeeAmmPool[]): FeeAmmPool[] {
	return pools
		.sort((a, b) => {
			const pathUsd = Addresses.pathUsd.toLowerCase()
			const aPriority = a.validatorToken.toLowerCase() === pathUsd
			const bPriority = b.validatorToken.toLowerCase() === pathUsd

			if (aPriority !== bPriority) {
				return aPriority ? -1 : 1
			}

			if (a.liquidityUsd !== b.liquidityUsd) {
				return b.liquidityUsd - a.liquidityUsd
			}

			const aTimestamp = a.latestMintAt ?? a.createdAt ?? 0
			const bTimestamp = b.latestMintAt ?? b.createdAt ?? 0
			return bTimestamp - aTimestamp
		})
		.slice(0, POOL_LIMIT)
}

/** The pools `Mint` events name, each one's reserves and tokens read from the node. */
export const fetchFeeAmmPools = createServerFn({ method: 'POST' }).handler(
	async (): Promise<FeeAmmPool[]> => {
		try {
			const chainId = getChainId(getWagmiConfig())
			const rows = await indexer(
				chainId,
				`SELECT topic2, topic3, count() AS mints,
					toUnixTimestamp(min(block_timestamp)) AS first_at,
					toUnixTimestamp(max(block_timestamp)) AS last_at
				FROM logs WHERE address = '${Addresses.feeManager.toLowerCase()}' AND topic0 = '${MINT}'
				GROUP BY topic2, topic3`,
			)
			const client = getBatchedClient()
			const topicAddress = (topic: unknown) =>
				`0x${String(topic).slice(-40)}` as Address.Address
			// Every pool's user and validator token, in the rows' order.
			const metadata = getTokensMetadata(
				rows.flatMap((row) => [
					topicAddress(row.topic2),
					topicAddress(row.topic3),
				]),
			)
			const pools = await Promise.all(
				rows.map(async (row, i): Promise<FeeAmmPool> => {
					const userToken = topicAddress(row.topic2)
					const validatorToken = topicAddress(row.topic3)
					const pool = {
						address: Addresses.feeManager,
						abi: Abis.feeAmm,
						args: [userToken, validatorToken],
					} as const
					const [poolId, reserves, tokens] = await Promise.all([
						client.readContract({ ...pool, functionName: 'getPoolId' }),
						client.readContract({ ...pool, functionName: 'getPool' }),
						metadata,
					])
					const [user, validator] = [tokens[2 * i], tokens[2 * i + 1]]
					const userDecimals = user?.decimals ?? 6
					const validatorDecimals = validator?.decimals ?? 6
					return {
						poolId,
						userToken,
						validatorToken,
						createdAt: Number(row.first_at),
						latestMintAt: Number(row.last_at),
						mintCount: Number(row.mints),
						reserveUserToken: reserves.reserveUserToken,
						reserveValidatorToken: reserves.reserveValidatorToken,
						// Both sides are USD stablecoins, counted at par.
						liquidityUsd:
							Number(formatUnits(reserves.reserveUserToken, userDecimals)) +
							Number(
								formatUnits(reserves.reserveValidatorToken, validatorDecimals),
							),
						userTokenName: user?.name ?? '',
						userTokenSymbol: user?.symbol ?? '',
						userTokenDecimals: userDecimals,
						validatorTokenName: validator?.name ?? '',
						validatorTokenSymbol: validator?.symbol ?? '',
						validatorTokenDecimals: validatorDecimals,
					}
				}),
			)
			return sortFeeAmmPools(pools)
		} catch (error) {
			console.error('Failed to fetch Fee AMM pools:', error)
			return []
		}
	},
)
