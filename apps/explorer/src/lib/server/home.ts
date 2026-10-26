import { createServerFn } from '@tanstack/react-start'
import { getChainId } from 'wagmi/actions'
import { indexer } from '#lib/server/dex-indexer'
import {
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
}

/** The home page's tiles, charts and latest lists, read from the indexer. */
export const fetchHomeStats = createServerFn({ method: 'GET' }).handler(
	async (): Promise<HomeStats> => {
		const chainId = getChainId(getWagmiConfig())
		const [[newest], head] = await Promise.all([
			indexer(
				chainId,
				'SELECT max(num) AS num, toUnixTimestamp(max(timestamp)) AS at, count() AS n FROM blocks',
			),
			getBatchedClient().getBlockNumber(),
		])
		const start = Number(newest?.at ?? 0) - HOME_MINUTES * 60
		const minute = (column: string) =>
			`intDiv(toUnixTimestamp(${column}) - ${start} - 1, 60)`
		const [blockMinutes, [txns], [tokens], blocks, txs] = await Promise.all([
			indexer(
				chainId,
				`SELECT ${minute('timestamp')} AS minute, count() AS blocks, sum(gas_used) AS gas,
					sum(gas_limit) AS gas_limit, min(timestamp_ms) AS first_ms, max(timestamp_ms) AS last_ms,
					min(num) AS first_num
				FROM blocks WHERE toUnixTimestamp(timestamp) > ${start} GROUP BY minute`,
			),
			indexer(chainId, 'SELECT count() AS n FROM txs'),
			// Refreshed on a schedule: `token_metadata` would aggregate every transfer.
			indexer(chainId, 'SELECT count() AS n FROM token_holder_counts'),
			indexer(
				chainId,
				`SELECT num, hash, toUnixTimestamp(timestamp) AS at, gas_used, gas_limit FROM blocks
				ORDER BY num DESC LIMIT ${HOME_ROWS}`,
			),
			readTransactions(chainId, HOME_ROWS),
		])
		// `txs` sorts by block, so a block bound spares a scan of every timestamp.
		const firstInHour = Math.min(
			Number(newest?.num ?? 0),
			...blockMinutes.map((row) => Number(row.first_num)),
		)
		const lowest = Number(blocks.at(-1)?.num ?? 0)
		const [txMinutes, counts] = await Promise.all([
			indexer(
				chainId,
				`SELECT ${minute('block_timestamp')} AS minute, count() AS txs FROM txs
				WHERE block_num >= ${firstInHour} GROUP BY minute`,
			),
			indexer(
				chainId,
				`SELECT block_num, count() AS n FROM txs WHERE block_num >= ${lowest} GROUP BY block_num`,
			),
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
			latestBlock: Number(newest?.num ?? 0),
			blockTimeMs: inWindow > 1 ? spanMs / (inWindow - 1) : null,
			tps: spanMs > 0 ? (sum(txPerMinute) * 1000) / spanMs : null,
			gasUtilization:
				gasLimit > 0 ? (sum(gasPerMinute) * 100) / gasLimit : null,
			totalTxns: Number(txns?.n ?? 0),
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
		}
	},
)
