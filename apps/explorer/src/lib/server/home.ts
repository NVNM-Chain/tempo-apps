import { createServerFn } from '@tanstack/react-start'
import { getChainId } from 'wagmi/actions'
import { getAccountType } from '#lib/account'
import { readBlockNumber } from '#lib/server/block-number'
import { indexer } from '#lib/server/dex-indexer'
import {
	countTransactions,
	type ListedTransaction,
	readTransactions,
} from '#lib/server/transaction-list'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config'

/** Minutes the charts cover, ending at the newest indexed block. */
export const HOME_MINUTES = 60
/** Rows in each latest list. */
const HOME_ROWS = 15

export type HomeStats = {
	/** The node's newest block. */
	head: number
	/** Blocks the indexer holds. */
	indexed: number
	/** When the indexer's newest block was made, once it is five minutes old and the head has passed it: tidx inserts in batches. */
	indexStaleSince: number | null
	latestBlock: number
	blockTimeMs: number | null
	tps: number | null
	/** Gas used over gas limit, in percent. */
	gasUtilization: number | null
	totalTxns: number
	tokens: number
	/** Per minute of the hour before the newest block, oldest first. */
	txPerMinute: number[]
	gasPerMinute: number[]
	blocks: {
		number: number
		hash: `0x${string}`
		timestamp: number
		txns: number
		gasUsed: number
		gasLimit: number
	}[]
	transactions: ListedTransaction[]
	/** The newest of them that succeeded on a contract. */
	example?: ListedTransaction
}

/**
 * `load`, whose last result answers every call for `ms`, and for up to a minute
 * more while one call per `ms` reloads it. No call awaits another's load: the
 * Workers runtime cancels as hung a request waiting on another request's fetch.
 */
function snapshotted<T>(load: () => Promise<T>, ms: number) {
	let latest: { value: T; at: number } | undefined
	let reloadAt = Number.NEGATIVE_INFINITY
	return async (): Promise<T> => {
		const now = Date.now()
		const age = latest ? now - latest.at : Number.POSITIVE_INFINITY
		if (latest && (age < ms || (age < 60_000 && now - reloadAt < ms)))
			return latest.value
		reloadAt = now
		const value = await load()
		latest = { value, at: Date.now() }
		return value
	}
}

/** The home page's tiles, charts and latest lists, read from the indexer once per 2 s for every viewer. */
export const fetchHomeStats = createServerFn({ method: 'GET' }).handler(
	snapshotted(async (): Promise<HomeStats> => {
		const chainId = getChainId(getWagmiConfig())
		const client = getBatchedClient()
		const [[newest], head] = await Promise.all([
			indexer(
				chainId,
				'SELECT max(num) AS num, toUnixTimestamp(max(timestamp)) AS at, count() AS n FROM blocks',
			),
			readBlockNumber(client),
		])
		// The window ends here, though tidx may index more blocks while the page is read.
		const newestNum = Number(newest?.num ?? 0)
		const newestAt = Number(newest?.at ?? 0)
		const start = newestAt - HOME_MINUTES * 60
		const minute = (column: string) =>
			`intDiv(toUnixTimestamp(${column}) - ${start} - 1, 60)`
		// Three chains at once: each second query starts when its first answers.
		const [
			[blockMinutes, txMinutes],
			[blocks, counts],
			[txs, codes],
			txns,
			[tokens],
		] = await Promise.all([
			indexer(
				chainId,
				`SELECT ${minute('timestamp')} AS minute, count() AS blocks, sum(gas_used) AS gas,
					sum(gas_limit) AS gas_limit, min(timestamp_ms) AS first_ms, max(timestamp_ms) AS last_ms,
					min(num) AS first_num
				FROM blocks WHERE toUnixTimestamp(timestamp) > ${start} AND num <= ${newestNum}
				GROUP BY minute`,
			).then(async (minutes) => {
				// `txs` sorts by block, so a block bound spares a scan of every timestamp.
				const firstInHour = Math.min(
					newestNum,
					...minutes.map((row) => Number(row.first_num)),
				)
				// `FINAL` as `countTransactions` counts.
				const perMinute = await indexer(
					chainId,
					`SELECT ${minute('block_timestamp')} AS minute, count() AS txs FROM txs FINAL
					WHERE block_num >= ${firstInHour} AND block_num <= ${newestNum} GROUP BY minute`,
				)
				return [minutes, perMinute] as const
			}),
			indexer(
				chainId,
				`SELECT num, hash, toUnixTimestamp(timestamp) AS at, gas_used, gas_limit FROM blocks
				ORDER BY num DESC LIMIT ${HOME_ROWS}`,
			).then(async (latest) => {
				const perBlock = await indexer(
					chainId,
					`SELECT block_num, count() AS n FROM txs FINAL WHERE block_num >= ${Number(latest.at(-1)?.num ?? 0)} GROUP BY block_num`,
				)
				return [latest, perBlock] as const
			}),
			readTransactions(chainId, HOME_ROWS).then(
				async (listed) =>
					[
						listed,
						// A recipient's code, as the address page reads it to offer a contract tab.
						await Promise.all(
							listed.map((tx) =>
								tx.to && !tx.failed
									? client.getCode({ address: tx.to }).catch(() => undefined)
									: undefined,
							),
						),
					] as const,
			),
			countTransactions(chainId),
			// Refreshed on a schedule: `token_metadata` would aggregate every transfer.
			indexer(chainId, 'SELECT count() AS n FROM token_holder_counts'),
		])

		const txPerMinute = Array<number>(HOME_MINUTES).fill(0)
		const gasPerMinute = Array<number>(HOME_MINUTES).fill(0)
		let [inWindow, gasLimit, firstMs, lastMs] = [0, 0, Infinity, 0]
		for (const row of blockMinutes) {
			const at = Number(row.minute)
			if (at >= 0 && at < HOME_MINUTES) gasPerMinute[at] = Number(row.gas)
			inWindow += Number(row.blocks)
			gasLimit += Number(row.gas_limit)
			firstMs = Math.min(firstMs, Number(row.first_ms))
			lastMs = Math.max(lastMs, Number(row.last_ms))
		}
		for (const row of txMinutes) {
			const at = Number(row.minute)
			if (at >= 0 && at < HOME_MINUTES) txPerMinute[at] = Number(row.txs)
		}
		// Millisecond timestamps, since sub-second blocks share a whole second.
		const spanMs = Math.max(lastMs - firstMs, 0)
		const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
		const perBlock = new Map(
			counts.map((row) => [Number(row.block_num), Number(row.n)]),
		)

		return {
			head: Number(head),
			indexed: Number(newest?.n ?? 0),
			indexStaleSince:
				Number(head) > newestNum && Date.now() / 1000 - newestAt > 300
					? newestAt
					: null,
			latestBlock: newestNum,
			blockTimeMs: inWindow > 1 ? spanMs / (inWindow - 1) : null,
			tps: spanMs > 0 ? (sum(txPerMinute) * 1000) / spanMs : null,
			gasUtilization:
				gasLimit > 0 ? (sum(gasPerMinute) * 100) / gasLimit : null,
			totalTxns: txns,
			tokens: Number(tokens?.n ?? 0),
			txPerMinute,
			gasPerMinute,
			blocks: blocks.map((row) => ({
				number: Number(row.num),
				hash: String(row.hash) as `0x${string}`,
				timestamp: Number(row.at),
				txns: perBlock.get(Number(row.num)) ?? 0,
				gasUsed: Number(row.gas_used),
				gasLimit: Number(row.gas_limit),
			})),
			transactions: txs,
			example: txs.find((_, i) => getAccountType(codes[i]) === 'contract'),
		}
	}, 2_000),
)
