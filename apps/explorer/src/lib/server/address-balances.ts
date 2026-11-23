import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { erc20Abi, formatUnits } from 'viem'
import { getChainId } from 'wagmi/actions'

import type { BalancesResponse, TokenBalance } from '#lib/address-balances'
import { indexer } from '#lib/server/dex-indexer'
import {
	getTokenMetadata,
	getVerifiedTokens,
} from '#lib/server/verified-tokens'
import { zAddress } from '#lib/zod'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config.ts'

export const TIP20_DECIMALS = 6
export const MAX_TOKENS = 50

/** USD-denominated tokens first by value, then others by raw balance. */
function sortBalances(balances: TokenBalance[]): TokenBalance[] {
	return balances.sort((a, b) => {
		const aIsUsd = a.currency === 'USD'
		const bIsUsd = b.currency === 'USD'

		if (aIsUsd && bIsUsd) {
			const aValue = Number(
				formatUnits(BigInt(a.balance), a.decimals ?? TIP20_DECIMALS),
			)
			const bValue = Number(
				formatUnits(BigInt(b.balance), b.decimals ?? TIP20_DECIMALS),
			)
			return bValue - aValue
		}

		if (aIsUsd) return -1
		if (bIsUsd) return 1

		return Number(BigInt(b.balance) - BigInt(a.balance))
	})
}

/**
 * The tokens tidx has seen the address hold, and the chain's listed tokens,
 * each balance read from the node: tidx misses balances set at genesis.
 */
export async function fetchAddressBalancesData(params: {
	address: Address.Address
	chainId: number
	maxTokens?: number | undefined
}): Promise<BalancesResponse> {
	const { address, chainId } = params
	const maxTokens = params.maxTokens ?? MAX_TOKENS

	const [held, listed] = await Promise.all([
		indexer(
			chainId,
			`SELECT DISTINCT token FROM address_holder_deltas
			WHERE holder = '${address.toLowerCase()}' LIMIT ${maxTokens}`,
		),
		getVerifiedTokens(chainId),
	])
	const tokens = [
		...new Set([
			...held.map((row) => String(row.token) as Address.Address),
			...listed.map((token) => token.address),
		]),
	].slice(0, maxTokens)

	const client = getBatchedClient()
	const balances = await Promise.all(
		tokens.map(async (token): Promise<TokenBalance | undefined> => {
			const [balance, metadata] = await Promise.all([
				client
					.readContract({
						address: token,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [address],
					})
					.catch(() => undefined),
				getTokenMetadata(token),
			])
			if (!balance) return undefined
			return { token, balance: String(balance), ...metadata }
		}),
	)

	return {
		balances: sortBalances(balances.filter((balance) => balance !== undefined)),
	}
}

export const fetchAddressBalances = createServerFn({ method: 'GET' })
	.inputValidator((input) => zAddress().parse(input))
	.handler(({ data }) =>
		fetchAddressBalancesData({
			address: data,
			chainId: getChainId(getWagmiConfig()),
		}),
	)
