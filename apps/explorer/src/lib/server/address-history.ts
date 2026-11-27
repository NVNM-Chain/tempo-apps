import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import {
	type AbiFunction,
	type TransactionReceipt,
	toFunctionSelector,
} from 'viem'
import * as z from 'zod/mini'

import { zonePortalAbi } from '#lib/abis'
import {
	decodeKnownTransactionCalls,
	type KnownEvent,
	parseKnownEvents,
	type TransactionLike,
} from '#lib/domain/known-events'
import { type GetTip20MetadataFn, metadataForTokens } from '#lib/domain/tip20'
import { selectTransactionDescriptionEvents } from '#lib/domain/transaction-activities'
import { indexer, sqlTime } from '#lib/server/dex-indexer'
import { getBatchedClient, getTempoChain } from '#wagmi.config'

export const [MAX_LIMIT, DEFAULT_LIMIT] = [10, 10]
const HISTORY_TOTAL_CACHE_TTL = 60_000
const HISTORY_TOTAL_CACHE_MAX_ENTRIES = 50
// One selector per submitBatch signature (T13 added tokenEnablementTransition).
export const SUBMIT_BATCH_SELECTORS = [
	...new Set(
		zonePortalAbi
			.filter((item) => item.type === 'function' && item.name === 'submitBatch')
			.map((item) => toFunctionSelector(item as AbiFunction)),
	),
]

export type EnrichedTransaction = {
	hash: `0x${string}`
	blockNumber: string
	transactionIndex?: number | undefined
	timestamp: number
	from: `0x${string}`
	to: `0x${string}` | null
	value: string
	status: 'success' | 'reverted'
	gasUsed: string
	effectiveGasPrice: string
	knownEvents: KnownEvent[]
}

export type HistoryResponse = {
	transactions: EnrichedTransaction[]
	total: number | null
	limit: number
	nextCursor: string | null
	reverseCursor: string | null
	countCapped: boolean
	error: null | string
}

export const RequestParametersSchema = z.object({
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	cursor: z.optional(z.string()),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	status: z.optional(z.enum(['success', 'reverted'])),
	after: z.optional(z.coerce.number()),
	// Upstream hides a zone portal's batch submissions through the Tempo API; accepted, not applied here.
	hideSubmitBatches: z.optional(z.enum(['true', 'false'])),
})

export type HistoryRequestParameters = z.infer<typeof RequestParametersSchema>

const historyTotalCache = new Map<
	string,
	{ promise: Promise<number | undefined>; timestamp: number }
>()

/** The receipts a page reads: the address's side, the status and the start time. */
function historyFilters(
	address: Address.Address,
	searchParams: HistoryRequestParameters,
): string[] {
	const account = address.toLowerCase()
	const filters = [
		searchParams.include === 'sent'
			? `"from" = '${account}'`
			: searchParams.include === 'received'
				? `"to" = '${account}'`
				: `("from" = '${account}' OR "to" = '${account}')`,
	]
	if (searchParams.status)
		filters.push(`status = ${searchParams.status === 'success' ? 1 : 0}`)
	if (searchParams.after !== undefined)
		filters.push(`block_timestamp >= '${sqlTime(searchParams.after * 1000)}'`)
	return filters
}

/** Where a page ends: its last receipt's block and index. */
function historyCursor(row: Record<string, unknown>): string {
	return btoa(JSON.stringify([Number(row.block_num), Number(row.tx_idx)]))
}

/** The `[block, index]` a history cursor continues from. */
function parseHistoryCursor(cursor: string): [number, number] {
	const parsed: unknown = JSON.parse(atob(cursor))
	const position = (value: unknown): value is number =>
		typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
	const [block, index] =
		Array.isArray(parsed) && parsed.length === 2 ? parsed : []
	if (!position(block) || !position(index))
		throw new Error('Invalid history cursor')
	return [block, index]
}

function getCachedHistoryTotal(
	key: string,
): Promise<number | undefined> | undefined {
	const cached = historyTotalCache.get(key)
	if (cached && Date.now() - cached.timestamp < HISTORY_TOTAL_CACHE_TTL)
		return cached.promise
	if (cached) historyTotalCache.delete(key)
}

function cacheHistoryTotal(key: string, promise: Promise<number | undefined>) {
	if (
		!historyTotalCache.has(key) &&
		historyTotalCache.size >= HISTORY_TOTAL_CACHE_MAX_ENTRIES
	) {
		const oldestKey = historyTotalCache.keys().next().value
		if (oldestKey) historyTotalCache.delete(oldestKey)
	}

	historyTotalCache.set(key, { promise, timestamp: Date.now() })
	void promise.then((total) => {
		if (total === undefined && historyTotalCache.get(key)?.promise === promise)
			historyTotalCache.delete(key)
	})
}

function serializeBigInts<T>(value: T): T {
	if (typeof value === 'bigint') {
		return value.toString() as T
	}
	if (Array.isArray(value)) {
		return value.map(serializeBigInts) as T
	}
	if (value !== null && typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [key, nestedValue] of Object.entries(value)) {
			result[key] = serializeBigInts(nestedValue)
		}
		return result as T
	}
	return value
}

/** Maps the node's transaction and receipt to the UI contract. */
export function toEnrichedTransaction(
	transaction: TransactionLike & { value?: bigint | undefined },
	receipt: TransactionReceipt,
	options: {
		timestamp: number
		includeKnownEvents: boolean
		getTokenMetadata: GetTip20MetadataFn
	},
): EnrichedTransaction {
	const knownEvents = (() => {
		if (!options.includeKnownEvents) return []
		try {
			return selectTransactionDescriptionEvents({
				activityEvents: [],
				fallbackEvents: parseKnownEvents(receipt, {
					transaction,
					getTokenMetadata: options.getTokenMetadata,
					chainId: getTempoChain().id,
				}),
				knownCalls: decodeKnownTransactionCalls(transaction, receipt.status),
			})
		} catch (error) {
			console.error(
				`[history] failed to parse known events for ${receipt.transactionHash}:`,
				error,
			)
			return []
		}
	})()

	return {
		hash: receipt.transactionHash,
		blockNumber: Hex.fromNumber(receipt.blockNumber),
		transactionIndex: receipt.transactionIndex,
		timestamp: options.timestamp,
		from: Address.checksum(receipt.from),
		to: receipt.to ? Address.checksum(receipt.to) : null,
		value: Hex.fromNumber(transaction.value ?? 0n),
		status: receipt.status,
		gasUsed: Hex.fromNumber(receipt.gasUsed),
		effectiveGasPrice: Hex.fromNumber(receipt.effectiveGasPrice),
		knownEvents: serializeBigInts(knownEvents),
	}
}

export async function fetchAddressHistoryData(params: {
	address: Address.Address
	chainId: number
	searchParams: HistoryRequestParameters
	maxLimit?: number | undefined
	includeKnownEvents?: boolean | undefined
}): Promise<HistoryResponse> {
	const { address, chainId, searchParams } = params
	const maxLimit = params.maxLimit ?? MAX_LIMIT
	const includeKnownEvents = params.includeKnownEvents ?? true

	let limit = Number.isFinite(searchParams.limit)
		? Math.floor(searchParams.limit)
		: DEFAULT_LIMIT
	if (limit > maxLimit) throw new Error('Limit is too high')
	if (limit < 1) limit = 1

	Address.assert(address)
	const filters = historyFilters(address, searchParams)
	const totalKey = JSON.stringify([chainId, filters])
	const cachedTotal = getCachedHistoryTotal(totalKey)
	// Only the latest edge refreshes the count. The oldest edge is fetched in
	// parallel with ascending order and reuses the same cached total.
	const includeTotal =
		searchParams.cursor === undefined &&
		searchParams.sort === 'desc' &&
		cachedTotal === undefined
	const direction = searchParams.sort === 'asc' ? 'ASC' : 'DESC'
	const paged = [...filters]
	if (searchParams.cursor) {
		const [block, index] = parseHistoryCursor(searchParams.cursor)
		paged.push(
			`(block_num, tx_idx) ${direction === 'ASC' ? '>' : '<'} (${block}, ${index})`,
		)
	}
	const rowsPromise = indexer(
		chainId,
		`SELECT tx_hash, block_num, tx_idx, toUnixTimestamp(block_timestamp) AS timestamp
		FROM receipts WHERE ${paged.join(' AND ')}
		ORDER BY block_num ${direction}, tx_idx ${direction} LIMIT ${limit + 1}`,
	)
	const requestedTotal = includeTotal
		? indexer(
				chainId,
				`SELECT count() AS n FROM receipts WHERE ${filters.join(' AND ')}`,
			).then(
				([row]) => (row ? Number(row.n) : undefined),
				() => undefined,
			)
		: undefined
	if (requestedTotal) cacheHistoryTotal(totalKey, requestedTotal)

	const [rows, total] = await Promise.all([
		rowsPromise,
		cachedTotal ?? requestedTotal,
	])
	const page = rows.slice(0, limit)

	const client = getBatchedClient()
	const fetched = await Promise.all(
		page.map((row) => {
			const hash = String(row.tx_hash) as Hex.Hex
			return Promise.all([
				client.getTransaction({ hash }),
				client.getTransactionReceipt({ hash }),
			])
		}),
	)
	const getTokenMetadata = includeKnownEvents
		? await metadataForTokens(
				fetched.flatMap(([, receipt]) =>
					receipt.logs.map((log) => log.address),
				),
			)
		: () => undefined

	const transactions = fetched.map(([transaction, receipt], index) =>
		toEnrichedTransaction(transaction, receipt as TransactionReceipt, {
			timestamp: Number(page[index]?.timestamp ?? 0),
			includeKnownEvents,
			getTokenMetadata,
		}),
	)
	if (searchParams.sort === 'asc') transactions.reverse()

	const last = page.at(-1)
	return {
		transactions,
		total: total ?? null,
		limit,
		nextCursor: rows.length > limit && last ? historyCursor(last) : null,
		reverseCursor: page[0] ? historyCursor(page[0]) : null,
		countCapped: false,
		error: null,
	}
}
