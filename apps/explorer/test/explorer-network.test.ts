import { describe, expect, it } from 'vitest'
import {
	buildExplorerNetworkHref,
	EXPLORER_NETWORK_OPTIONS,
	getActiveExplorerNetworkOption,
	isExplorerNetworkPathPreservable,
} from '#lib/explorer-network.ts'

const NVNM_HOST = 'https://scan.nvnm.canary.mantrachain.dev'

const SAMPLE_HASH =
	'0x0000000000000000000000000000000000000000000000000000000000000000'
const SAMPLE_ADDRESS = '0x20c0000000000000000000000000000000000000'

describe('explorer network switcher hrefs', () => {
	it('offers NVNM chains only — Tempo networks are not served by this build', () => {
		expect(EXPLORER_NETWORK_OPTIONS).toEqual([
			expect.objectContaining({ env: 'nvnm', host: NVNM_HOST }),
		])
		expect(
			EXPLORER_NETWORK_OPTIONS.some((option) =>
				option.host.includes('tempo.xyz'),
			),
		).toBe(false)
	})

	it('resolves the active option for the only supported env', () => {
		expect(getActiveExplorerNetworkOption('nvnm')).toEqual(
			EXPLORER_NETWORK_OPTIONS[0],
		)
	})

	it.each([
		['transaction', `/tx/${SAMPLE_HASH}`],
		['receipt', `/receipt/${SAMPLE_HASH}`],
		['block', '/block/123456?page=2'],
		['address', `/address/${SAMPLE_ADDRESS}?tab=tokens&page=3`],
		['token compatibility route', `/token/${SAMPLE_ADDRESS}?tab=holders`],
		['fee amm route with hash', '/fee-amm#pools'],
	])('preserves the %s resource path when switching networks', (_, path) => {
		expect(buildExplorerNetworkHref(NVNM_HOST, path)).toBe(`${NVNM_HOST}${path}`)
	})

	it('normalizes a path without a leading slash', () => {
		expect(buildExplorerNetworkHref(NVNM_HOST, 'blocks')).toBe(
			`${NVNM_HOST}/blocks`,
		)
	})

	it('falls back to home when asked', () => {
		expect(
			buildExplorerNetworkHref(NVNM_HOST, '/simulate', {
				fallbackToHome: true,
			}),
		).toBe(`${NVNM_HOST}/`)
	})

	it('classifies preservable paths', () => {
		expect(isExplorerNetworkPathPreservable('/blocks')).toBe(true)
		expect(isExplorerNetworkPathPreservable('/simulate')).toBe(false)
	})
})
