import { afterEach, describe, expect, it, vi } from 'vitest'
import { tempoEnvSchema } from '#lib/build-env'
import { getTempoEnv, isTestnet } from '#lib/env'
import { getWagmiConfig } from '#wagmi.config'

vi.mock('@tanstack/react-start', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('@tanstack/react-start')>()
	return {
		...original,
		createIsomorphicFn: () => ({
			client: (_fn: () => unknown) => ({
				server: (fn: () => unknown) => fn,
			}),
		}),
	}
})

vi.mock('@tanstack/react-start/server', () => ({
	getRequestUrl: () => new URL('https://scan.nvnm.mainnet.nvnmchain.io'),
}))

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('deployment network selection', () => {
	it.each([
		['nvnm', true],
		['nvnm-mainnet', false],
		['nvnm-testnet', true],
	])('serves %s regardless of the request hostname', (env, testnet) => {
		vi.stubEnv('VITE_TEMPO_ENV', env)
		expect(getTempoEnv()).toBe(env)
		expect(isTestnet()).toBe(testnet)
	})

	it('defaults to the NVNM devnet when no network is configured', () => {
		vi.stubEnv('VITE_TEMPO_ENV', undefined)
		expect(getTempoEnv()).toBe('nvnm')
	})

	it('rejects an invalid network even on a recognized hostname', () => {
		vi.stubEnv('VITE_TEMPO_ENV', 'invalid')
		expect(() => getTempoEnv()).toThrow('VITE_TEMPO_ENV must be one of')
	})

	it('accepts testnet in the build environment schema', () => {
		expect(tempoEnvSchema.safeParse('nvnm-testnet').success).toBe(true)
	})

	it('registers only the selected network with wallets', () => {
		vi.stubEnv('VITE_TEMPO_ENV', 'nvnm-testnet')
		expect(getWagmiConfig().chains.map((chain) => chain.id)).toEqual([787223])
	})
})
