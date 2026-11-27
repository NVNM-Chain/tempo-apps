import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { formatUnits, pad, toEventSelector } from 'viem'
import { Addresses } from 'viem/tempo'
import { getChainId } from 'wagmi/actions'
import { Abis } from '#lib/abis'
import { type FeeAmmSearch, feeAmmSearchSchema } from '#lib/fee-amm'
import { indexer, list } from '#lib/server/dex-indexer'
import { getTokensMetadata } from '#lib/server/verified-tokens'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config'

export type FeeAmmPool = {
	poolId: `0x${string}`
	userToken: Address.Address
	validatorToken: Address.Address
	createdAt: number | null
	latestMintAt: number | null
	mintCount: number
	reserveUserToken: bigint | null
	reserveValidatorToken: bigint | null
	liquidityUsd: number | null
	userTokenSymbol: string
	userTokenName: string
	userTokenDecimals: number
	validatorTokenSymbol: string
	validatorTokenName: string
	validatorTokenDecimals: number
}

export type FeeAmmPage = { pools: FeeAmmPool[]; hasMore: boolean }

const mintTopics = [
	toEventSelector('Mint(address,address,address,address,uint256,uint256)'),
	toEventSelector('Mint(address,address,address,uint256,uint256,uint256)'),
]

/** Most active first, as the page says; ties by pair, whose topic addresses are lowercase. */
export function sortFeeAmmPools(pools: FeeAmmPool[]): FeeAmmPool[] {
	return pools.sort(
		(a, b) =>
			b.mintCount - a.mintCount ||
			b.userToken.localeCompare(a.userToken) ||
			b.validatorToken.localeCompare(a.validatorToken),
	)
}

/** One page of the pools `Mint` events name, with reserves and tokens read from the node. */
export async function getFeeAmmPools(input: FeeAmmSearch): Promise<FeeAmmPage> {
	const chainId = getChainId(getWagmiConfig())
	const token = input.token && pad(input.token.toLowerCase() as Address.Address)
	const rows = await indexer(
		chainId,
		`SELECT topic2, topic3, count() AS mints,
			toUnixTimestamp(min(block_timestamp)) AS first_at,
			toUnixTimestamp(max(block_timestamp)) AS last_at
		FROM logs WHERE address = '${Addresses.feeManager.toLowerCase()}' AND topic0 IN (${list(mintTopics)})
		${token ? `AND (topic2 = '${token}' OR topic3 = '${token}')` : ''}
		GROUP BY topic2, topic3`,
	)
	const client = getBatchedClient()
	const topicAddress = (topic: unknown) =>
		`0x${String(topic).slice(-40)}` as Address.Address
	// Every pool's user and validator token, in the rows' order.
	const metadata = getTokensMetadata(
		rows.flatMap((row) => [topicAddress(row.topic2), topicAddress(row.topic3)]),
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
				// Unknown reserves must not look like zero.
				client
					.readContract({ ...pool, functionName: 'getPool' })
					.catch(() => null),
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
				reserveUserToken: reserves?.reserveUserToken ?? null,
				reserveValidatorToken: reserves?.reserveValidatorToken ?? null,
				liquidityUsd:
					reserves && user?.currency === 'USD' && validator?.currency === 'USD'
						? Number(formatUnits(reserves.reserveUserToken, userDecimals)) +
							Number(
								formatUnits(reserves.reserveValidatorToken, validatorDecimals),
							)
						: null,
				userTokenName: user?.name ?? '',
				userTokenSymbol: user?.symbol ?? '',
				userTokenDecimals: userDecimals,
				validatorTokenName: validator?.name ?? '',
				validatorTokenSymbol: validator?.symbol ?? '',
				validatorTokenDecimals: validatorDecimals,
			}
		}),
	)
	const start = (input.page - 1) * input.limit
	return {
		pools: sortFeeAmmPools(pools).slice(start, start + input.limit),
		hasMore: pools.length > start + input.limit,
	}
}

export const fetchFeeAmmPools = createServerFn({ method: 'POST' })
	.inputValidator((input) => feeAmmSearchSchema.parse(input))
	.handler(async ({ data }): Promise<FeeAmmPage> => {
		let timeout: ReturnType<typeof setTimeout> | undefined
		try {
			return await Promise.race([
				getFeeAmmPools(data),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error('Fee AMM request timed out')),
						15_000,
					)
				}),
			])
		} catch (error) {
			console.error('Failed to fetch Fee AMM pools:', error)
			throw new Error(
				'Fee AMM liquidity is temporarily unavailable. Please try again.',
			)
		} finally {
			clearTimeout(timeout)
		}
	})
