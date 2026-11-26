import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildEnvSchema } from '../src/lib/build-env'
import { serverEnvSchema } from '../src/lib/server/env'
import wrangler from '../wrangler.json' with { type: 'json' }

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Client and CF-binding env vars that aren't covered by a schema importable
 * from a pure Node context. These change rarely — the schemas are the
 * primary source of truth for everything else.
 */
const CLIENT_AND_BINDING_VARS = [
	'BLOCKED_ASNS',
	'DATADOG_APPLICATION_ID',
	'DATADOG_CLIENT_TOKEN',
	'DATADOG_SITE',
	'SENTRY_DSN',
	'SENTRY_TRACES_SAMPLE_RATE',
	'VITE_CONTRACT_VERIFICATION_API_BASE_URL',
	'VITE_SENTRY_DSN',
	'VITE_SENTRY_TRACES_SAMPLE_RATE',
	'VITE_TEMPO_ENV',
] as const

function schemaKeys(schema: { shape: Record<string, unknown> }): string[] {
	return Object.keys(schema.shape)
}

const ALL_VARS = new Set([
	...schemaKeys(buildEnvSchema),
	...schemaKeys(serverEnvSchema),
	...CLIENT_AND_BINDING_VARS,
])

function parseEnvExample(): Set<string> {
	const content = readFileSync(resolve(__dirname, '../.env.example'), 'utf-8')
	const vars = new Set<string>()
	for (const line of content.split('\n')) {
		const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/)
		if (match) vars.add(match[1])
	}
	return vars
}

describe('env sync', () => {
	it('.env.example contains all canonical env vars', () => {
		const envExample = parseEnvExample()
		const missing = [...ALL_VARS].filter((v) => !envExample.has(v))
		expect(missing, `Missing from .env.example: ${missing.join(', ')}`).toEqual(
			[],
		)
	})

	it('.env.example has no unknown env vars', () => {
		const envExample = parseEnvExample()
		const unknown = [...envExample].filter((v) => !ALL_VARS.has(v))
		expect(
			unknown,
			`Unknown vars in .env.example: ${unknown.join(', ')}`,
		).toEqual([])
	})

	it('configures the testnet worker to use its own indexer and domain', () => {
		expect(wrangler.env['nvnm-testnet']).toMatchObject({
			name: 'explorer-nvnm-testnet',
			vars: {
				VITE_TEMPO_ENV: 'nvnm-testnet',
				TIDX_URL: 'https://indexer.nvnm.testnet.nvnmchain.io',
			},
			routes: [
				{
					custom_domain: true,
					pattern: 'scan.nvnm.testnet.nvnmchain.io',
				},
			],
			browser: { binding: 'BROWSER' },
		})
	})

	it('does not deploy the explorer through GitHub Actions', () => {
		const workflows = resolve(__dirname, '../../../.github/workflows')
		const main = readFileSync(resolve(workflows, 'main.yml'), 'utf-8')
		const pullRequest = readFileSync(
			resolve(workflows, 'pull-request.yml'),
			'utf-8',
		)

		expect(main).not.toMatch(/^ {2}deploy-explorer:/m)
		expect(pullRequest).not.toMatch(/^\s*-\s+app:\s*explorer\s*$/m)
	})
})
