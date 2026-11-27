import { createServerFn } from '@tanstack/react-start'
import type { Address, Hex } from 'ox'
import { erc20Abi } from 'viem'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { indexer } from '#lib/server/dex-indexer'
import { getTokensMetadata } from '#lib/server/verified-tokens'
import { zAddress } from '#lib/zod'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config.ts'

const COUNT_CAP = TOKEN_COUNT_MAX

/**
 * Resolves `total`/`totalCapped` for the numbered-pagination UI: prefer the
 * exact count when the API provides one, otherwise infer from the fetched
 * page (exact when the feed ends inside it). Totals are clamped to the
 * largest page-aligned row count inside the API's positional window so every
 * page the UI offers stays requestable.
 */
export function resolveTotal(options: {
	exactCount: number | undefined
	exactCountCapped?: boolean | undefined
	page: number
	limit: number
	rows: number
	exhausted: boolean
}): { total: number; totalCapped: boolean } {
	const { exactCount, exactCountCapped, page, limit, rows, exhausted } = options
	const maxNavigableRows = Math.floor(COUNT_CAP / limit) * limit
	if (exactCount !== undefined) {
		const totalCapped =
			Boolean(exactCountCapped) || exactCount > maxNavigableRows
		return {
			total: totalCapped ? maxNavigableRows : exactCount,
			totalCapped,
		}
	}
	if (exhausted)
		return {
			total: Math.min((page - 1) * limit + rows, maxNavigableRows),
			totalCapped: false,
		}
	return { total: maxNavigableRows, totalCapped: true }
}

const FetchTokenHoldersInputSchema = z.object({
	address: zAddress({ lowercase: true }),
	page: z.coerce.number().check(z.gte(1)),
	limit: z.coerce.number().check(z.gte(5), z.lte(200)),
})

export type FetchTokenHoldersInput = z.infer<
	typeof FetchTokenHoldersInputSchema
>

export type TokenHoldersApiResponse = {
	holders: Array<{
		address: Address.Address
		balance: string
	}>
	total: number
	totalCapped: boolean
	totalBalance: string
	/** Set when holders can't be computed (a plain ERC-20 past the log scan limit). */
	unavailable?: boolean | undefined
}

const EMPTY_HOLDERS_RESPONSE: TokenHoldersApiResponse = {
	holders: [],
	total: 0,
	totalCapped: false,
	totalBalance: '0',
}

export const fetchHolders = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenHoldersInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			if (data.page * data.limit > COUNT_CAP) return EMPTY_HOLDERS_RESPONSE
			const chainId = getChainId(getWagmiConfig())

			const [rows, [counted], supply] = await Promise.all([
				// `amount`, not `balance`: an alias would shadow the column in ORDER BY.
				// `holder` gives equal balances one order across pages.
				indexer(
					chainId,
					`SELECT holder, toString(balance) AS amount FROM token_balances_snapshot
					WHERE token = '${data.address}' AND balance > 0 ORDER BY balance DESC, holder
					LIMIT ${data.limit} OFFSET ${(data.page - 1) * data.limit}`,
				),
				indexer(
					chainId,
					`SELECT holder_count FROM token_holder_counts WHERE token = '${data.address}'`,
				),
				getBatchedClient()
					.readContract({
						address: data.address,
						abi: erc20Abi,
						functionName: 'totalSupply',
					})
					.catch(() => undefined),
			])

			return {
				holders: rows.map((row) => ({
					address: String(row.holder) as Address.Address,
					balance: String(row.amount),
				})),
				...resolveTotal({
					exactCount: counted ? Number(counted.holder_count) : undefined,
					page: data.page,
					limit: data.limit,
					rows: rows.length,
					exhausted: rows.length < data.limit,
				}),
				totalBalance: supply?.toString() ?? '0',
			}
		} catch (error) {
			console.error('Failed to fetch holders:', error)
			return EMPTY_HOLDERS_RESPONSE
		}
	})

const FetchTokenTransfersInputSchema = z.object({
	address: zAddress({ lowercase: true }),
	page: z.coerce.number().check(z.gte(1)),
	limit: z.coerce.number().check(z.gte(5), z.lte(200)),
	account: z.optional(zAddress({ lowercase: true })),
})

export type FetchTokenTransfersInput = z.infer<
	typeof FetchTokenTransfersInputSchema
>

export type TokenTransfersApiResponse = {
	transfers: Array<{
		id: string
		from: Address.Address
		to: Address.Address
		value: string
		transactionHash: Hex.Hex
		blockNumber: string
		timestamp: string | null
	}>
	total: number
	totalCapped: boolean
}

const EMPTY_TRANSFERS_RESPONSE: TokenTransfersApiResponse = {
	transfers: [],
	total: 0,
	totalCapped: false,
}

const FetchAccountTransfersInputSchema = z.object({
	account: zAddress({ lowercase: true }),
	page: z.coerce.number().check(z.gte(1)),
	limit: z.coerce.number().check(z.gte(5), z.lte(200)),
	direction: z.optional(z.enum(['in', 'out'])),
})

export type AccountTransfersApiResponse = {
	transfers: Array<{
		id: string
		from: Address.Address
		to: Address.Address
		value: string
		transactionHash: Hex.Hex
		blockNumber: string
		timestamp: string | null
		token: {
			address: Address.Address
			symbol: string
			decimals: number
			currency: string
		}
	}>
	total: number
	totalCapped: boolean
}

const EMPTY_ACCOUNT_TRANSFERS_RESPONSE: AccountTransfersApiResponse = {
	transfers: [],
	total: 0,
	totalCapped: false,
}

/** A page of transfers, newest first, and how many match. */
async function indexedTransfers(params: {
	chainId: number
	page: number
	limit: number
	token?: Address.Address | undefined
	account?: Address.Address | undefined
	direction?: 'in' | 'out' | undefined
}) {
	const { account, direction } = params
	const filters = [
		params.token && `token = '${params.token}'`,
		account &&
			(direction === 'in'
				? `"to" = '${account}'`
				: direction === 'out'
					? `"from" = '${account}'`
					: `("from" = '${account}' OR "to" = '${account}')`),
	].filter(Boolean)
	const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
	const [rows, [counted]] = await Promise.all([
		indexer(
			params.chainId,
			`SELECT token, "from", "to", toString(amount) AS value, tx_hash, block_num, log_idx,
				toUnixTimestamp(block_timestamp) AS timestamp
			FROM token_transfers ${where}
			ORDER BY block_num DESC, log_idx DESC
			LIMIT ${params.limit} OFFSET ${(params.page - 1) * params.limit}`,
		),
		indexer(
			params.chainId,
			`SELECT count() AS n FROM token_transfers ${where}`,
		),
	])
	return {
		transfers: rows.map((row) => ({
			id: `${row.tx_hash}-${row.log_idx}`,
			token: String(row.token) as Address.Address,
			from: String(row.from) as Address.Address,
			to: String(row.to) as Address.Address,
			value: String(row.value),
			transactionHash: String(row.tx_hash) as Hex.Hex,
			blockNumber: String(row.block_num),
			timestamp: String(row.timestamp),
		})),
		...resolveTotal({
			exactCount: counted ? Number(counted.n) : undefined,
			page: params.page,
			limit: params.limit,
			rows: rows.length,
			exhausted: rows.length < params.limit,
		}),
	}
}

/**
 * Token transfers where the account is sender or recipient, across all
 * tokens (the address page's account-scoped Transfers tab). Rows span
 * multiple contracts, so each carries its token's symbol/decimals.
 */
export const fetchAccountTransfers = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchAccountTransfersInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			if (data.page * data.limit > COUNT_CAP)
				return EMPTY_ACCOUNT_TRANSFERS_RESPONSE
			const chainId = getChainId(getWagmiConfig())

			const page = await indexedTransfers({ chainId, ...data })
			const metadata = await getTokensMetadata(
				page.transfers.map((transfer) => transfer.token),
			)

			return {
				...page,
				transfers: page.transfers.map(({ token, ...transfer }, i) => ({
					...transfer,
					token: {
						address: token,
						symbol: metadata[i]?.symbol ?? '',
						decimals: metadata[i]?.decimals ?? 0,
						currency: metadata[i]?.currency ?? '',
					},
				})),
			}
		} catch (error) {
			console.error('Failed to fetch account transfers:', error)
			throw error
		}
	})

export const fetchTransfers = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenTransfersInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			if (data.page * data.limit > COUNT_CAP) return EMPTY_TRANSFERS_RESPONSE
			const chainId = getChainId(getWagmiConfig())

			return await indexedTransfers({
				chainId,
				page: data.page,
				limit: data.limit,
				token: data.address,
				account: data.account,
			})
		} catch (error) {
			console.error('Failed to fetch transfers:', error)
			throw error
		}
	})
