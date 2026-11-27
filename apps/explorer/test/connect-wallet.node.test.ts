import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ConnectWallet } from '#comps/ConnectWallet'

vi.mock('@tanstack/react-router', () => ({
	ClientOnly: ({ children }: { children: ReactNode }) => children,
	Link: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('wagmi', () => ({
	useChains: () => [{ id: 787223, name: 'NVNM Testnet' }],
	useClient: () => ({}),
	useConnect: () => ({ isPending: false }),
	useConnection: () => ({
		address: '0x0000000000000000000000000000000000000001',
		chain: { id: 1 },
		connector: { id: 'injected', name: 'Browser' },
	}),
	useConnectors: () => [{ id: 'injected', name: 'Browser' }],
	useDisconnect: () => ({ mutate: vi.fn() }),
	useSwitchChain: () => ({ isSuccess: false, mutate: vi.fn() }),
}))

vi.mock('wagmi/tempo', () => ({
	Hooks: {
		fee: {
			useSetUserTokenSync: () => ({ mutate: vi.fn() }),
			useUserToken: () => ({ data: undefined }),
		},
	},
}))

vi.mock('#wagmi.config.ts', () => ({
	getTempoChain: () => ({ id: 787223 }),
}))

vi.mock('#lib/env.ts', () => ({
	getApiUrl: () => new URL('http://localhost'),
	getTempoEnv: () => 'nvnm-testnet',
	isTestnet: () => true,
}))

function renderConnectedWallet() {
	return renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client: new QueryClient() },
			createElement(ConnectWallet),
		),
	)
}

describe('NVNM testnet wallet actions', () => {
	it('does not offer the unsupported RPC faucet', () => {
		const html = renderConnectedWallet()
		expect(html).toContain('Connected as')
		expect(html).not.toContain('Fund from faucet')
	})

	it('names the selected network when adding it to a wallet', () => {
		const html = renderConnectedWallet()
		expect(html).toContain('NVNM Testnet')
		expect(html).not.toContain('Add Tempo')
	})
})
