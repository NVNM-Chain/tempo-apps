import { afterEach, describe, expect, it, vi } from 'vitest'
import viteConfig from '../vite.config'

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('Vite network configuration', () => {
	it('selects the matching Cloudflare environment for development', async () => {
		vi.stubEnv('CLOUDFLARE_ENV', undefined)
		vi.stubEnv('VITE_TEMPO_ENV', 'nvnm-testnet')
		if (typeof viteConfig !== 'function')
			throw new Error('Expected Vite config')

		await viteConfig({
			command: 'serve',
			mode: 'development',
			isPreview: false,
			isSsrBuild: false,
		})

		expect(process.env.CLOUDFLARE_ENV).toBe('nvnm-testnet')
	})

	it('does not retarget an already-built preview', async () => {
		vi.stubEnv('CLOUDFLARE_ENV', undefined)
		vi.stubEnv('VITE_TEMPO_ENV', 'nvnm-mainnet')
		if (typeof viteConfig !== 'function')
			throw new Error('Expected Vite config')

		await viteConfig({
			command: 'serve',
			mode: 'preview',
			isPreview: true,
			isSsrBuild: false,
		})

		expect(process.env.CLOUDFLARE_ENV).toBeUndefined()
	})
})
