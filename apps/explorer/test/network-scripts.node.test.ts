import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = mkdtempSync(join(tmpdir(), 'explorer-network-scripts-'))

beforeAll(() => {
	for (const command of ['pnpm', 'wrangler']) {
		writeFileSync(
			join(bin, command),
			`#!/bin/sh\nprintf '${command}|%s|%s|%s\\n' "$CLOUDFLARE_ENV" "$VITE_TEMPO_ENV" "$*"\n`,
			{ mode: 0o755 },
		)
	}
})

afterAll(() => {
	rmSync(bin, { recursive: true, force: true })
})

function runScript(
	script: string,
	args: string[],
	env: Record<string, string>,
) {
	return spawnSync(
		'env',
		[
			'-u',
			'CLOUDFLARE_ENV',
			'-u',
			'VITE_TEMPO_ENV',
			'-u',
			'npm_config_env',
			...Object.entries(env).map(([key, value]) => `${key}=${value}`),
			'bash',
			resolve(root, 'scripts', script),
			...args,
		],
		{
			cwd: root,
			encoding: 'utf-8',
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
			},
		},
	)
}

describe('network build and deploy scripts', () => {
	it('builds testnet when selected through VITE_TEMPO_ENV', () => {
		const result = runScript('build.sh', [], {
			VITE_TEMPO_ENV: 'nvnm-testnet',
		})
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout).toContain(
			'pnpm|nvnm-testnet|nvnm-testnet|vite build --mode=nvnm-testnet',
		)
	})

	it('rejects conflicting build environment selections', () => {
		const result = runScript('build.sh', [], {
			CLOUDFLARE_ENV: 'nvnm-mainnet',
			VITE_TEMPO_ENV: 'nvnm-testnet',
		})
		expect(result.status).not.toBe(0)
		expect(result.stderr).toContain('mismatch')
	})

	it('builds the selected testnet before deploying it', () => {
		const result = runScript(
			'deploy.sh',
			['--env', 'nvnm-testnet', '--dry-run'],
			{},
		)
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout.trim().split('\n')).toEqual([
			'pnpm|nvnm-testnet|nvnm-testnet|vite build --mode=nvnm-testnet',
			'wrangler|nvnm-testnet|nvnm-testnet|deploy --env nvnm-testnet --dry-run',
		])
	})

	it('accepts a deployment selected through the environment', () => {
		const result = runScript('deploy.sh', ['--dry-run'], {
			VITE_TEMPO_ENV: 'nvnm-testnet',
		})
		expect(result.status, result.stderr).toBe(0)
		expect(result.stdout.trim().split('\n')).toEqual([
			'pnpm|nvnm-testnet|nvnm-testnet|vite build --mode=nvnm-testnet',
			'wrangler|nvnm-testnet|nvnm-testnet|deploy --dry-run',
		])
	})
})
