import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route } from '#routes/search'

// On the server the API's base is the request's URL, and here there is no request.
vi.mock('#lib/env', () => ({
	getApiUrl: (path: string, params: URLSearchParams) =>
		new URL(`${path}?${params}`, 'http://explorer.test'),
}))

/** Where `/search?q=` sends a query the API answers with `results`. */
async function redirectFor(q: string, results: unknown[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ results, query: q })),
	)
	try {
		await (Route.options.beforeLoad as (ctx: unknown) => Promise<void>)({
			search: { q },
		})
	} catch (thrown) {
		return (thrown as { options: unknown }).options
	}
	throw new Error('no redirect')
}

afterEach(() => vi.unstubAllGlobals())

describe('/search', () => {
	it('opens the one registry or record an anchoring search finds', async () => {
		expect(
			await redirectFor('relayed', [
				{ type: 'anchoring', registryId: 7, label: 'relayed' },
			]),
		).toMatchObject({
			to: '/anchoring/$registryId',
			params: { registryId: '7' },
		})
		expect(
			await redirectFor('sum-1', [
				{ type: 'anchoring', registryId: 2, recordId: 1, label: 'sum-1' },
			]),
		).toMatchObject({
			to: '/anchoring/$registryId/$recordId',
			params: { registryId: '2', recordId: '1' },
		})
	})

	it('lands on the home page for an anchoring id that is no id', async () => {
		expect(
			await redirectFor('relayed', [
				{ type: 'anchoring', registryId: 0, label: 'relayed' },
			]),
		).toMatchObject({ to: '/', search: { q: 'relayed' } })
	})
})
