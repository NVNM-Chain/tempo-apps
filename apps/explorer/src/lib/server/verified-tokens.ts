import type { Address } from 'ox'
import { erc20Abi } from 'viem'
import { Abis } from '#lib/abis'
import { isTip20Address } from '#lib/domain/tip20'
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

/** In every NVNM genesis. */
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11'

// Values, not reads in flight, which Workers requests cannot share.
const metadataCache = new Map<string, TokenMetadata>()

/**
 * Each token's metadata from the node, read once and together; `undefined` for a
 * contract that is no token or a failed read, either of which the next call retries.
 */
export async function getTokensMetadata(
	tokens: readonly Address.Address[],
): Promise<(TokenMetadata | undefined)[]> {
	const keys = tokens.map((token) => token.toLowerCase() as Address.Address)
	const missing = [...new Set(keys)].filter((key) => !metadataCache.has(key))
	if (missing.length) {
		const read = await readMetadata(missing)
		missing.forEach((key, i) => {
			const metadata = read[i]
			if (metadata) metadataCache.set(key, metadata)
		})
	}
	return keys.map((key) => metadataCache.get(key))
}

/** One Multicall3 call per field for all `tokens`, in chunks of 16 KiB of calldata. */
async function readMetadata(
	tokens: Address.Address[],
): Promise<(TokenMetadata | undefined)[]> {
	const client = getBatchedClient()
	const batch = { multicallAddress: MULTICALL3, batchSize: 16_384 } as const
	// Only a TIP-20 has one, so a failed read is a failure to retry, not an ERC-20.
	const tip20s = tokens.filter(isTip20Address)
	const [names, symbols, decimals, currencies] = await Promise.all([
		client.multicall({
			...batch,
			contracts: tokens.map(
				(address) =>
					({ address, abi: erc20Abi, functionName: 'name' }) as const,
			),
		}),
		client.multicall({
			...batch,
			contracts: tokens.map(
				(address) =>
					({ address, abi: erc20Abi, functionName: 'symbol' }) as const,
			),
		}),
		client.multicall({
			...batch,
			contracts: tokens.map(
				(address) =>
					({ address, abi: erc20Abi, functionName: 'decimals' }) as const,
			),
		}),
		// viem sends an empty batch too.
		tip20s.length
			? client.multicall({
					...batch,
					contracts: tip20s.map(
						(address) =>
							({ address, abi: Abis.tip20, functionName: 'currency' }) as const,
					),
				})
			: [],
	])
	const currency = new Map<string, (typeof currencies)[number]>(
		tip20s.map((address, i) => [address, currencies[i]]),
	)
	return tokens.map((address, i) => {
		const [name, symbol, decimal] = [names[i], symbols[i], decimals[i]]
		const tip20 = currency.get(address)
		if (
			name?.status !== 'success' ||
			symbol?.status !== 'success' ||
			decimal?.status !== 'success' ||
			tip20?.status === 'failure'
		)
			return undefined
		return {
			name: name.result,
			symbol: symbol.result,
			decimals: decimal.result,
			currency: tip20?.result ?? '',
		}
	})
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
		const addresses = rows.map((row) => String(row.token) as Address.Address)
		const metadata = await getTokensMetadata(addresses)
		const listed = rows.flatMap((row, i) => {
			const found = metadata[i]
			const address = addresses[i]
			return found && address
				? [{ ...found, address, holdersCount: Number(row.holder_count) }]
				: []
		})
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
