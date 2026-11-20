import { QB, Tidx } from 'tidx.ts'
import { serverEnv, tempoApiUrl } from './env'

export const indexerBackend = {
	// The hosted API mounts tidx under /v1/indexer; a self-hosted tidx serves
	// /query at its root. The tidx.ts client appends /query to baseUrl.
	url: serverEnv.TIDX_URL ?? `${tempoApiUrl}/v1/indexer`,
	headers: serverEnv.TEMPO_API_KEY
		? { 'tempo-api-key': serverEnv.TEMPO_API_KEY }
		: undefined,
}

const tidx = Tidx.create({
	baseUrl: indexerBackend.url,
	headers: indexerBackend.headers,
})

tidx.on('response', (res) => {
	if (!res.ok)
		res
			.clone()
			.text()
			.then((body) =>
				console.error(
					`[tidx:${res.status}]`,
					decodeURIComponent(res.url),
					body,
				),
			)
})

export function tempoQueryBuilder(
	chainId: number,
	options: { engine?: string | undefined } = {},
) {
	return QB.from({ ...tidx, chainId, ...options })
}

export { tidx }
