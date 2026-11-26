import { QB, Tidx } from 'tidx.ts'
import { nvnmTestnet } from '#lib/chains'
import { serverEnv } from './env'

// Empty rather than tidx.ts's default, which is Tempo's own indexer.
export const indexerUrl = serverEnv.TIDX_URL ?? ''

const tidx = Tidx.create({ baseUrl: indexerUrl })

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
	return QB.from({
		...tidx,
		chainId,
		// The testnet indexer's default engine does not respond to queries.
		engine:
			options.engine ?? (chainId === nvnmTestnet.id ? 'clickhouse' : undefined),
	})
}

export { tidx }
