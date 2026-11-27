import * as z from 'zod/mini'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'

const clientEnvSchema = z.object({
	CONTRACT_VERIFICATION_API_BASE_URL: z.prefault(
		z.url(),
		'https://contracts.tempo.xyz',
	),
})

export const clientEnv = clientEnvSchema.parse({
	CONTRACT_VERIFICATION_API_BASE_URL: import.meta.env
		.VITE_CONTRACT_VERIFICATION_API_BASE_URL,
})

/**
 * Environments this build serves, one per deployment: `nvnm` is the devnet.
 * The selected build environment is authoritative for both client and server.
 */
export type TempoEnv = 'nvnm' | 'nvnm-testnet' | 'nvnm-mainnet'

const TEMPO_ENVS = [
	'nvnm',
	'nvnm-testnet',
	'nvnm-mainnet',
] as const satisfies readonly TempoEnv[]

function normalizeTempoEnv(value: string | undefined): TempoEnv {
	// Unset falls back (vitest and other tooling never inject it). A *wrong*
	// value throws rather than silently resolving to another network — the
	// upstream behaviour turned a typo into an explorer showing the wrong
	// chain's data while looking perfectly healthy.
	if (value === undefined || value === '') return 'nvnm'
	const env = TEMPO_ENVS.find((candidate) => candidate === value)
	if (env) return env
	throw new Error(
		`VITE_TEMPO_ENV must be one of ${TEMPO_ENVS.join(' | ')} — got '${value}'`,
	)
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

export function getTempoEnv(): TempoEnv {
	return normalizeTempoEnv(import.meta.env.VITE_TEMPO_ENV)
}

/** True for every NVNM chain but mainnet; the UI gates testnet-only affordances on it (see comps/Header.tsx). */
export function isTestnet(): boolean {
	return getTempoEnv() !== 'nvnm-mainnet'
}
