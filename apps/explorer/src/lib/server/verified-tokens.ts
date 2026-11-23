import type { Address } from 'ox'
import { erc20Abi } from 'viem'
import { Abis } from '#lib/abis'
import { indexer } from '#lib/server/dex-indexer'
import { getBatchedClient } from '#wagmi.config'

/**
 * Server-only. Must not be imported from client-reachable modules (including
 * server-fn files like `tokens.ts`, whose non-server-fn exports survive into
 * the client bundle together with their imports).
 */

export type TokenMetadata = {
	name: string
	symbol: string
	decimals: number
	/** A TIP-20's currency; empty for an ERC-20. */
	currency: string
}

const metadataCache = new Map<string, Promise<TokenMetadata | undefined>>()

/** A token's metadata from the node, read once; `undefined` for a contract that is no token. */
export function getTokenMetadata(
	token: Address.Address,
): Promise<TokenMetadata | undefined> {
	const key = token.toLowerCase()
	const cached = metadataCache.get(key)
	if (cached) return cached
	const client = getBatchedClient()
	const erc20 = { address: token, abi: erc20Abi } as const
	const metadata = Promise.all([
		client.readContract({ ...erc20, functionName: 'name' }),
		client.readContract({ ...erc20, functionName: 'symbol' }),
		client.readContract({ ...erc20, functionName: 'decimals' }),
		client
			.readContract({
				address: token,
				abi: Abis.tip20,
				functionName: 'currency',
			})
			.catch(() => ''),
	]).then(
		([name, symbol, decimals, currency]) => ({
			name,
			symbol,
			decimals,
			currency,
		}),
		() => {
			metadataCache.delete(key)
			return undefined
		},
	)
	metadataCache.set(key, metadata)
	return metadata
}

/** A token the explorer lists: no registry curates NVNM's, so every token tidx has seen held. */
export type VerifiedToken = TokenMetadata & {
	address: Address.Address
	holdersCount: number
}

type CachedVerifiedTokens = { tokens: VerifiedToken[]; ts: number }

const verifiedTokensCache = new Map<number, CachedVerifiedTokens>()

/**
 * The chain's tokens, most holders first (5-min memo). Serves search, the
 * token list and the listed-token spam filters; falls back to the last good
 * snapshot when tidx or the node is unreachable.
 */
export async function getVerifiedTokens(
	chainId: number,
): Promise<VerifiedToken[]> {
	const now = Date.now()
	const cached = verifiedTokensCache.get(chainId)
	if (cached && now - cached.ts < 5 * 60_000) return cached.tokens

	try {
		const rows = await indexer(
			chainId,
			'SELECT token, holder_count FROM token_holder_counts ORDER BY holder_count DESC LIMIT 200',
		)
		const tokens = await Promise.all(
			rows.map(async (row) => {
				const address = String(row.token) as Address.Address
				const metadata = await getTokenMetadata(address)
				return (
					metadata && {
						...metadata,
						address,
						holdersCount: Number(row.holder_count),
					}
				)
			}),
		)
		const listed = tokens.filter((token) => token !== undefined)
		verifiedTokensCache.set(chainId, { tokens: listed, ts: now })
		return listed
	} catch (error) {
		console.error('Failed to list tokens:', error)
		return cached?.tokens ?? []
	}
}

/** Lowercased contract addresses of the chain's listed tokens. */
export async function getVerifiedTokenAddresses(
	chainId: number,
): Promise<Set<string>> {
	const tokens = await getVerifiedTokens(chainId)
	return new Set(tokens.map((token) => token.address.toLowerCase()))
}
