import type { TempoEnv } from '#lib/env'

export const EXPLORER_ORGANIZATION_ID =
	'https://mantrachain.io/#organization'

const CANONICAL_EXPLORER_ORIGINS: Partial<Record<TempoEnv, string>> = {
	nvnm: 'https://scan.nvnm.canary.mantrachain.dev',
}

const EXPLORER_HOST_REDIRECTS = new Map([
	['scan.787222.nvnm.canary.mantrachain.dev', 'scan.nvnm.canary.mantrachain.dev'],
])

/**
 * Hosts served with `noindex`. The internal devnet must never be indexed —
 * every NVNM host stays here until a public network exists.
 */
const NON_INDEXABLE_EXPLORER_HOSTS = new Set([
	'scan.nvnm.canary.mantrachain.dev',
])

export type ExplorerHostPolicy = { type: 'redirect'; location: string }

export function getExplorerHostPolicy(
	requestUrl: string | URL,
): ExplorerHostPolicy | undefined {
	const url = new URL(requestUrl)
	const hostname = url.hostname.toLowerCase()

	const canonicalHostname = EXPLORER_HOST_REDIRECTS.get(hostname)
	if (!canonicalHostname) return undefined

	url.protocol = 'https:'
	url.hostname = canonicalHostname
	url.port = ''

	return { type: 'redirect', location: url.toString() }
}

export function isNonIndexableExplorerHost(hostname: string): boolean {
	const host = hostname.toLowerCase()
	return (
		NON_INDEXABLE_EXPLORER_HOSTS.has(host) ||
		host.includes('explorer-devnet') ||
		host.includes('explorer-nextfork')
	)
}

export function withExplorerIndexingHeaders(
	requestUrl: string | URL,
	response: Response,
): Response {
	const url = new URL(requestUrl)
	if (!isNonIndexableExplorerHost(url.hostname)) return response

	const headers = new Headers(response.headers)
	headers.set('X-Robots-Tag', 'noindex, nofollow')

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	})
}

export function getCanonicalExplorerUrl(
	tempoEnv: TempoEnv,
	pathname: string,
): string | undefined {
	const origin = CANONICAL_EXPLORER_ORIGINS[tempoEnv]
	if (!origin) return undefined

	const url = new URL(origin)
	url.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`
	return url.toString()
}

export function getExplorerWebApplication(tempoEnv: TempoEnv) {
	const origin = CANONICAL_EXPLORER_ORIGINS[tempoEnv]
	if (!origin) return undefined

	const name = 'NVNM Explorer'

	return {
		'@context': 'https://schema.org',
		'@id': `${origin}/#application`,
		'@type': 'WebApplication',
		applicationCategory: 'DeveloperApplication',
		description:
			'Explore and analyze blocks, transactions, contracts, and tokens on Tempo.',
		isPartOf: { '@id': 'https://mantrachain.io/#website' },
		name,
		operatingSystem: 'Web',
		provider: { '@id': EXPLORER_ORGANIZATION_ID },
		url: `${origin}/`,
	}
}
