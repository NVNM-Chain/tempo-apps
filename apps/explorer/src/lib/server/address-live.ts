import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import { decodeEventLog, parseAbiItem, type TransactionReceipt } from 'viem'
import {
	liveQuerySchema,
	buildLiveQueries,
	type LiveQuery,
} from '#lib/live-query'
import { readSse } from '#lib/sse'
import { parseTimestamp } from '#lib/timestamp'
import { metadataForTokens } from '#lib/domain/tip20'
import { getBatchedClient } from '#wagmi.config'
import { indexerUrl } from './tempo-queries-provider'
import { getTokensMetadata } from './verified-tokens'
import {
	toEnrichedTransaction,
	SUBMIT_BATCH_SELECTORS,
} from './address-history'
import { isZonePortalAddress } from '#lib/domain/zones'

const transferAbi = [
	parseAbiItem(
		'event Transfer(address indexed from, address indexed to, uint256 value)',
	),
]

export async function addressLiveResponse(
	request: Request,
	address: string,
	chainId: number,
): Promise<Response> {
	const parsed = liveQuerySchema.safeParse({
		...Object.fromEntries(new URL(request.url).searchParams),
		address,
	})
	if (!parsed.success)
		return Response.json(
			{ error: 'Invalid live feed parameters' },
			{ status: 400 },
		)
	const options = parsed.data
	const abort = new AbortController()
	const stop = () => abort.abort()
	request.signal.addEventListener('abort', stop, { once: true })
	if (request.signal.aborted) stop()
	const deadline = setTimeout(stop, 120_000)
	const encoder = new TextEncoder()
	const seen = new Set<string>()
	const metadata = new Map<
		string,
		Promise<{
			address: Address.Address
			symbol: string
			decimals: number
			currency: string
		}>
	>()
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const emit = (event: string, data: unknown) => {
				if (!abort.signal.aborted)
					controller.enqueue(
						encoder.encode(
							`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
						),
					)
			}
			const heartbeat = setInterval(() => {
				if (!abort.signal.aborted)
					controller.enqueue(encoder.encode(': heartbeat\n\n'))
			}, 15_000)
			const run = async (sql: string) => {
				const url = new URL(`${indexerUrl}/query`)
				url.search = new URLSearchParams({
					sql,
					chainId: String(chainId),
					live: 'true',
				}).toString()
				const response = await fetch(url, {
					signal: abort.signal,
					headers: { Accept: 'text/event-stream' },
				})
				if (!response.ok || !response.body)
					throw new Error(`Live indexer returned ${response.status}`)
				for await (const event of readSse(response.body)) {
					let result: { ok: boolean; columns: string[]; rows: unknown[][] }
					if (event.event === 'lagged') {
						// Keep the stream open: reconnecting can repeat the same catch-up notice.
						// A fresh PostgreSQL head snapshot repairs the visible window, then
						// subsequent block deltas continue over the existing connection.
						const snapshotUrl = new URL(url)
						snapshotUrl.searchParams.delete('live')
						snapshotUrl.searchParams.set('engine', 'postgres')
						const snapshot = await fetch(snapshotUrl, {
							signal: abort.signal,
							headers: {
								Accept: 'application/json',
								'Cache-Control': 'no-cache',
							},
						})
						if (!snapshot.ok) throw new Error('Live resynchronization failed')
						result = (await snapshot.json()) as typeof result
					} else {
						if (event.event === 'error')
							throw new Error(`Live indexer error: ${event.data}`)
						if (event.event !== 'result') continue
						result = JSON.parse(event.data) as typeof result
					}
					if (!result.ok)
						throw new Error(`Live query failed: ${JSON.stringify(result)}`)
					const rows = result.rows.map((values) =>
						Object.fromEntries(
							result.columns.map((column, index) => [column, values[index]]),
						),
					)
					const fresh = rows.filter((row) => {
						const id =
							options.kind === 'transactions'
								? String(row.hash)
								: `${row.tx_hash}-${row.log_idx}`
						if (seen.has(id)) return false
						seen.add(id)
						return true
					})
					if (!fresh.length) continue
					const data = await normalizeRows(fresh, options, metadata)
					if (data.length) emit('rows', { kind: options.kind, rows: data })
					// Bound memory even for a busy account; only the latest visible window matters.
					while (seen.size > 5_000) {
						const first = seen.values().next().value
						if (first) seen.delete(first)
					}
				}
			}
			void Promise.all(buildLiveQueries(options).map(run))
				.then(() => {
					emit('end', {})
				})
				.catch((error) => {
					if (!abort.signal.aborted)
						console.error(
							'Address live stream failed:',
							error instanceof Error
								? `${error.message} ${'detail' in error ? JSON.stringify(error.detail) : ''}`
								: 'Unknown error',
						)
					emit('feed-error', { message: 'Live connection interrupted' })
				})
				.finally(() => {
					stop()
					clearTimeout(deadline)
					clearInterval(heartbeat)
					request.signal.removeEventListener('abort', stop)
					try {
						controller.close()
					} catch {
						/* The client may already have cancelled. */
					}
				})
		},
		cancel: stop,
	})
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no',
		},
	})
}

async function normalizeRows(
	rows: Record<string, unknown>[],
	options: LiveQuery,
	metadata: Map<
		string,
		Promise<{
			address: Address.Address
			symbol: string
			decimals: number
			currency: string
		}>
	>,
) {
	if (options.kind === 'transactions') {
		const client = getBatchedClient()
		const blocks = new Map<bigint, Promise<number>>()
		const timestamp = (blockNumber: bigint) => {
			if (!blocks.has(blockNumber))
				blocks.set(
					blockNumber,
					client
						.getBlock({ blockNumber })
						.then((block) => Number(block.timestamp)),
				)
			return blocks.get(blockNumber) as Promise<number>
		}
		// tidx can stream a block before the node serves it: wait briefly, then
		// leave out a transaction the node still can't return.
		const fetched = (
			await Promise.all(
				rows.map(async (row) => {
					const hash = String(row.hash)
					Hex.assert(hash)
					try {
						const receipt = await client.waitForTransactionReceipt({
							hash,
							timeout: 10_000,
						})
						const [transaction, at] = await Promise.all([
							client.getTransaction({ hash }),
							timestamp(receipt.blockNumber),
						])
						return [transaction, receipt, at] as const
					} catch {
						return null
					}
				}),
			)
		).filter((row) => row !== null)
		const filtered = fetched.filter(([transaction, receipt]) => {
			if (options.status && receipt.status !== options.status) return false
			if (
				options.hideSubmitBatches === 'true' &&
				isZonePortalAddress(options.address)
			) {
				const calls = [
					{ to: transaction.to, input: transaction.input },
					...(((transaction as { calls?: unknown }).calls ?? []) as {
						to?: string | null
						input?: string
						data?: string
					}[]),
				]
				if (
					calls.some(
						(call) =>
							call.to?.toLowerCase() === options.address &&
							SUBMIT_BATCH_SELECTORS.some((selector) =>
								(call.input ?? ('data' in call ? call.data : '') ?? '')
									.toLowerCase()
									.startsWith(selector),
							),
					)
				)
					return false
			}
			return true
		})
		const getTokenMetadata = await metadataForTokens(
			filtered.flatMap(([, receipt]) => receipt.logs.map((log) => log.address)),
		)
		return filtered.map(([transaction, receipt, at]) =>
			toEnrichedTransaction(transaction, receipt as TransactionReceipt, {
				timestamp: at,
				includeKnownEvents: true,
				getTokenMetadata,
			}),
		)
	}
	const transfers = await Promise.all(
		rows.map(async (row) => {
			const tokenAddress = String(row.address)
			Address.assert(tokenAddress)
			const hash = String(row.tx_hash)
			Hex.assert(hash)
			// An ERC-721 Transfer has the same topic but no amount.
			const decoded = (() => {
				try {
					return decodeEventLog({
						abi: transferAbi,
						data: String(row.data) as Hex.Hex,
						topics: [
							String(row.topic0),
							String(row.topic1),
							String(row.topic2),
						] as [Hex.Hex, Hex.Hex, Hex.Hex],
					})
				} catch {
					return undefined
				}
			})()
			if (!decoded) return null
			const transfer = {
				id: `${hash}-${row.log_idx}`,
				from: decoded.args.from,
				to: decoded.args.to,
				value: decoded.args.value.toString(),
				transactionHash: hash,
				blockNumber: String(row.block_num),
				timestamp: String(parseTimestamp(row.block_timestamp) ?? ''),
			}
			if (options.kind === 'token-transfers') return transfer
			if (!metadata.has(tokenAddress))
				metadata.set(
					tokenAddress,
					getTokensMetadata([tokenAddress])
						.catch(() => [])
						.then(([token]) => ({
							address: tokenAddress,
							symbol: token?.symbol ?? '',
							decimals: token?.decimals ?? 0,
							currency: token?.currency ?? '',
						})),
				)
			return { ...transfer, token: await metadata.get(tokenAddress) }
		}),
	)
	return transfers.filter((transfer) => transfer !== null)
}
