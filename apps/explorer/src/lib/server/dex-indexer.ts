import { indexerBackend } from '#lib/server/tempo-queries-provider'

export type Row = Record<string, unknown>

/** Runs SQL against the chain's indexer; `signature` exposes a decoded event table. */
export async function indexer(
	chainId: number,
	sql: string,
	signature?: string,
): Promise<Row[]> {
	const url = new URL(`${indexerBackend.url}/query`)
	url.search = new URLSearchParams({
		sql,
		chainId: String(chainId),
		engine: 'clickhouse',
		...(signature ? { signature } : {}),
	}).toString()
	const response = await fetch(url, {
		headers: { Accept: 'application/json', ...indexerBackend.headers },
	})
	const result = (await response.json().catch(() => null)) as {
		ok?: boolean
		columns?: string[]
		rows?: unknown[][]
		// tidx answers a string; the API in front of it, `{ code, message }`.
		error?: string | { message?: string }
	} | null
	const columns = result?.columns
	if (!response.ok || !result?.ok || !columns || !result.rows) {
		const error = result?.error
		const reason = typeof error === 'object' ? error.message : error
		throw new Error(
			`Indexer query failed (${response.status}): ${reason ?? 'no result'}`,
		)
	}
	return result.rows.map((values) =>
		Object.fromEntries(columns.map((name, i) => [name, values[i]])),
	)
}

export function list(values: Iterable<string>): string {
	return [...values].map((value) => `'${value}'`).join(', ')
}
