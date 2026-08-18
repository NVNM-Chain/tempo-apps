import * as z from 'zod/mini'

/**
 * Server-side environment variables available at module load time.
 * These are set via `.env` or `wrangler secret put`.
 *
 * Variables injected per-request via Cloudflare bindings (e.g. SENTRY_DSN,
 * SENTRY_TRACES_SAMPLE_RATE) are accessed via the `env` parameter in request
 * handlers and are not included here.
 */
export const serverEnvSchema = z.object({
	TEMPO_API_KEY: z.optional(z.string()),
	TEMPO_API_URL: z.optional(z.string()),
	TIDX_URL: z.optional(z.string()),
})

export const serverEnv = serverEnvSchema.parse(process.env)

/**
 * Base URL for the Tempo API.
 *
 * Defaults to our self-hosted tapimo: api.tempo.xyz serves Tempo's own chains
 * and rejects 787222 with `chain_id_unsupported`.
 */
export const tempoApiUrl =
	serverEnv.TEMPO_API_URL ?? 'https://api.nvnm.canary.mantrachain.dev'
