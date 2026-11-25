import { describe, expect, it } from 'vitest'
import { inferTempoEnvFromHostname } from '#lib/env'

describe('inferTempoEnvFromHostname', () => {
	it.each([
		// Mainnet's hosts contain the devnet's patterns too.
		['scan.nvnm.mainnet.nvnmchain.io', 'nvnm-mainnet'],
		['explorer-nvnm-mainnet.example.workers.dev', 'nvnm-mainnet'],
		['scan.nvnm.canary.mantrachain.dev', 'nvnm'],
		['explorer-nvnm.example.workers.dev', 'nvnm'],
		['explore.tempo.xyz', undefined],
	])('%s serves %s', (host, env) => {
		expect(inferTempoEnvFromHostname(host)).toBe(env)
	})
})
