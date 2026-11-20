import type { Abi } from 'viem'
import { allAbis } from '#lib/abis'
import { getAbiItem } from '#lib/domain/contracts'
import { indexer, list } from '#lib/server/dex-indexer'

export type ListedTransaction = {
	hash: `0x${string}`
	block: number
	timestamp: number
	from: `0x${string}`
	to: `0x${string}` | null
	method: string | null
	failed: boolean
}

/** A call's function name from the known ABIs, else its selector. */
function method(input: string): string | null {
	const selector = input.slice(0, 10) as `0x${string}`
	if (selector.length < 10) return null
	return getAbiItem({ abi: allAbis as Abi, selector })?.name ?? selector
}

/** Indexed transactions, newest first, with their method and whether they failed. */
export async function readTransactions(
	chainId: number,
	limit: number,
	offset = 0,
): Promise<ListedTransaction[]> {
	const rows = await indexer(
		chainId,
		`SELECT hash, block_num, toUnixTimestamp(block_timestamp) AS at, "from", "to", input FROM txs
		ORDER BY block_num DESC, idx DESC LIMIT ${limit} OFFSET ${offset}`,
	)
	const receipts = rows.length
		? await indexer(
				chainId,
				`SELECT tx_hash, status FROM receipts WHERE tx_hash IN (${list(rows.map((row) => String(row.hash)))})`,
			)
		: []
	const failed = new Set(
		receipts
			.filter((row) => Number(row.status) === 0)
			.map((row) => String(row.tx_hash)),
	)
	return rows.map((row) => ({
		hash: String(row.hash) as `0x${string}`,
		block: Number(row.block_num),
		timestamp: Number(row.at),
		from: String(row.from) as `0x${string}`,
		to: row.to ? (String(row.to) as `0x${string}`) : null,
		method: method(String(row.input ?? '')),
		failed: failed.has(String(row.hash)),
	}))
}
