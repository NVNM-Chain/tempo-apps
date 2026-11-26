import { indexerUrl } from '#lib/server/tempo-queries-provider'

export type Row = Record<string, unknown>

/** Runs SQL against the chain's indexer; `signature` exposes a decoded event table. */
export async function indexer(
	chainId: number,
	sql: string,
	signature?: string,
): Promise<Row[]> {
	if (!indexerUrl) throw new Error('TIDX_URL is not set')
	const url = new URL(`${indexerUrl}/query`)
	url.search = new URLSearchParams({
		sql,
		chainId: String(chainId),
		engine: 'clickhouse',
		...(signature ? { signature } : {}),
	}).toString()
	const response = await fetch(url, {
		headers: { Accept: 'application/json' },
	})
	const result = (await response.json().catch(() => null)) as {
		ok?: boolean
		columns?: string[]
		rows?: unknown[][]
		error?: string
	} | null
	const columns = result?.columns
	if (!response.ok || !result?.ok || !columns || !result.rows)
		throw new Error(
			`Indexer query failed (${response.status}): ${result?.error ?? 'no result'}`,
		)
	return result.rows.map((values) =>
		Object.fromEntries(columns.map((name, i) => [name, values[i]])),
	)
}

/** ClickHouse `DateTime` literal; the indexer rejects ISO-Z strings. */
export function sqlTime(ms: number): string {
	return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * `rows` with one row per value of `columns`: a tidx restart can insert a row twice, and
 * `FINAL`, which would merge them, times out on the busiest addresses and tokens.
 */
export function distinct(rows: Row[], ...columns: string[]): Row[] {
	const seen = new Set<string>()
	return rows.filter((row) => {
		const key = columns.map((column) => String(row[column])).join(':')
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

export function list(values: Iterable<string>): string {
	return [...values].map((value) => `'${value}'`).join(', ')
}
