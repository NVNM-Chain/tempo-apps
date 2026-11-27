import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { erc20Abi } from 'viem'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { getVerifiedTokens } from '#lib/server/verified-tokens'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config.ts'

export type Token = {
	address: Address.Address
	symbol: string
	name: string
	currency: string
	createdAt?: number | undefined
	holdersCount?: number
	decimals?: number | undefined
	/** In base units; unset when the node could not say. */
	totalSupply?: string | undefined
}

const FetchTokensInputSchema = z.object({
	page: z.coerce.number().check(z.gte(1)),
	limit: z.coerce.number().check(z.gte(1), z.lte(25)),
})

export type TokensApiResponse = {
	tokens: Token[]
	total: number
}

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const { page, limit } = data
		const offset = (page - 1) * limit

		const chainId = getChainId(getWagmiConfig())
		const tokens = await getVerifiedTokens(chainId)
		const pageTokens = tokens.slice(offset, offset + limit)

		const client = getBatchedClient()
		const supplies = await Promise.all(
			pageTokens.map((token) =>
				client
					.readContract({
						address: token.address,
						abi: erc20Abi,
						functionName: 'totalSupply',
					})
					.catch(() => undefined),
			),
		)

		return {
			total: tokens.length,
			tokens: pageTokens.map((token, index) => ({
				...token,
				totalSupply: supplies[index]?.toString(),
			})),
		}
	})
