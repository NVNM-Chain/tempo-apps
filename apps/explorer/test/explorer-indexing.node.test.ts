import { describe, expect, it } from 'vitest'
import {
	getCanonicalExplorerUrl,
	getExplorerHostPolicy,
	getExplorerWebApplication,
	withExplorerIndexingHeaders,
} from '#lib/explorer-indexing.ts'

const NVNM_HOST = 'scan.nvnm.canary.mantrachain.dev'

describe('explorer host policy', () => {
	it('redirects the chain-id alias to the canonical host', () => {
		expect(
			getExplorerHostPolicy(`https://scan.787222.nvnm.canary.mantrachain.dev/blocks`),
		).toEqual({
			type: 'redirect',
			location: `https://${NVNM_HOST}/blocks`,
		})
	})

	it('leaves the canonical host alone', () => {
		expect(getExplorerHostPolicy(`https://${NVNM_HOST}/`)).toBeUndefined()
	})

	it('no longer recognises Tempo public hosts', () => {
		expect(
			getExplorerHostPolicy('https://explore.tempo.xyz/'),
		).toBeUndefined()
		expect(
			getExplorerHostPolicy('https://explore.testnet.tempo.xyz/'),
		).toBeUndefined()
	})
})

describe('indexing headers', () => {
	it('marks the internal devnet noindex', () => {
		const response = withExplorerIndexingHeaders(
			`https://${NVNM_HOST}/blocks`,
			new Response('ok'),
		)
		expect(response.headers.get('x-robots-tag')).toContain('noindex')
	})
})

describe('canonical urls and schema.org payload', () => {
	it('builds canonical urls for the nvnm env', () => {
		expect(getCanonicalExplorerUrl('nvnm', '/tokens')).toBe(
			`https://${NVNM_HOST}/tokens`,
		)
	})

	it('describes the application as the NVNM explorer', () => {
		expect(getExplorerWebApplication('nvnm')).toMatchObject({
			'@id': `https://${NVNM_HOST}/#application`,
			name: 'NVNM Explorer',
			url: `https://${NVNM_HOST}/`,
		})
	})
})
