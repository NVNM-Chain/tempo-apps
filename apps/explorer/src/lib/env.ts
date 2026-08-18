import * as z from 'zod/mini'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'

const clientEnvSchema = z.object({
	CONTRACT_VERIFICATION_API_BASE_URL: z.prefault(
		z.url(),
		'https://contracts.tempo.xyz',
	),
})

export const clientEnv = clientEnvSchema.parse(import.meta.env)

/**
 * Environments this build serves. NVNM chains only — Tempo's own networks were
 * removed deliberately, so adding one back means adding a chain definition, a
 * wrangler env and a network-switcher entry too.
 */
export type TempoEnv = 'nvnm'

const TEMPO_ENVS = ['nvnm'] as const satisfies readonly TempoEnv[]

export function inferTempoEnvFromHostname(
	hostname: string | undefined,
): TempoEnv | undefined {
	if (!hostname) return undefined

	const host = hostname.toLowerCase()

	if (
		host.includes('explorer-nvnm') ||
		host.includes('scan.nvnm.') ||
		host.includes('scan.787222.')
	) {
		return 'nvnm'
	}

	return undefined
}

function normalizeTempoEnv(value: string | undefined): TempoEnv {
	// Unset falls back (vitest and other tooling never inject it). A *wrong*
	// value throws rather than silently resolving to another network — the
	// upstream behaviour turned a typo into an explorer showing the wrong
	// chain's data while looking perfectly healthy.
	if (value === undefined || value === '') return 'nvnm'
	if ((TEMPO_ENVS as readonly string[]).includes(value))
		return value as TempoEnv
	throw new Error(
		`VITE_TEMPO_ENV must be one of ${TEMPO_ENVS.join(' | ')} — got '${value}'`,
	)
}

function getRequestUrlIfAvailable(): URL | undefined {
	try {
		return getRequestUrl()
	} catch {
		return undefined
	}
}

export const getRequestURL = createIsomorphicFn()
	.client(() => new URL(__BASE_URL__ || window.location.origin))
	.server(() => getRequestUrl())

export const getApiBaseURL = createIsomorphicFn()
	.client(() => {
		const base = __BASE_URL__ || window.location.origin
		const url = new URL(base, window.location.origin)
		url.username = ''
		url.password = ''
		return url
	})
	.server(() => {
		if (__BASE_URL__) return new URL(__BASE_URL__)
		return getRequestUrl()
	})

export function getApiUrl(path: string, searchParams?: URLSearchParams): URL {
	const url = new URL(path, getApiBaseURL())
	if (searchParams) url.search = searchParams.toString()
	return url
}

export const getTempoEnv = createIsomorphicFn()
	.client(() => {
		const inferred = inferTempoEnvFromHostname(window.location.hostname)
		return inferred ?? normalizeTempoEnv(import.meta.env.VITE_TEMPO_ENV)
	})
	.server(() => {
		// Some modules read the active chain at import time before TanStack Start has
		// established request AsyncLocalStorage. Fall back to Vite env there. In
		// Cloudflare/Vite dev, `process.env` may not include the command env inside
		// the worker runtime.
		const inferred = inferTempoEnvFromHostname(
			getRequestUrlIfAvailable()?.hostname,
		)
		return inferred ?? normalizeTempoEnv(import.meta.env.VITE_TEMPO_ENV)
	})

/**
 * True for every non-production NVNM chain. The devnet is the only network this
 * build serves today, so this is constant — it stays a function because the UI
 * calls it to gate testnet-only affordances (see comps/Header.tsx).
 */
export const isTestnet = createIsomorphicFn()
	.client(() => true)
	.server(() => true)
