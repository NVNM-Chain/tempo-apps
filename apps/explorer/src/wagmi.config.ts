import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { createPublicClient } from 'viem'
import { tempoLocalnet } from 'viem/chains'
import { tempoActions } from 'viem/tempo'
import { loadBalance, rateLimit } from '@tempo/rpc-utils'
import { nvnmDevnet } from './lib/chains'
import { getTempoEnv } from './lib/env'
import { serverEnv, tempoApiUrl } from './lib/server/env'
import {
	cookieStorage,
	cookieToInitialState,
	createConfig,
	createStorage,
	http,
	serialize,
} from 'wagmi'
import { tempoWallet } from 'wagmi/connectors'

export type WagmiConfig = ReturnType<typeof getWagmiConfig>
let wagmiConfigSingleton: ReturnType<typeof createConfig> | null = null

/**
 * This build serves exactly one chain. Kept behind createIsomorphicFn so the
 * call sites (and the client/server split) stay identical to upstream.
 */
export const getTempoChain = createIsomorphicFn()
	.client(() => nvnmDevnet)
	.server(() => nvnmDevnet)

/**
 * Browser RPC target.
 *
 * Upstream sends client traffic to proxy.tempo.xyz, which has no route for our
 * chain id: SSR would render correctly and every client-side query would then
 * 404 — a page that is right on first paint and wrong a moment later.
 */
function getRpcProxyUrl() {
	return { http: nvnmDevnet.rpcUrls.default.http[0] }
}

const getFallbackUrls = createIsomorphicFn()
	.client(() => ({
		// Browser requests must never hit direct RPC fallbacks.
		http: [] as string[],
	}))
	.server(() => {
		const chain = getTempoChain()
		return {
			http: [...chain.rpcUrls.default.http],
		}
	})

const getTempoTransport = createIsomorphicFn()
	.client(() => {
		const proxy = getRpcProxyUrl()

		// Browser traffic should only hit the RPC proxy. Direct chain RPC endpoints
		// may require credentials that are only available server-side.
		return loadBalance([
			rateLimit(http(proxy.http), {
				requestsPerSecond: 20,
			}),
		])
	})
	.server(() => {
		const chain = getTempoChain()

		// tapimo RPC passthrough, when an API key is configured.
		const apiKey = serverEnv.TEMPO_API_KEY
		if (apiKey)
			return http(`${tempoApiUrl}/rpc/${chain.id}`, {
				fetchOptions: { headers: { 'tempo-api-key': apiKey } },
			})

		const proxy = getRpcProxyUrl()
		const fallbackUrls = getFallbackUrls()
		return loadBalance([
			http(proxy.http),
			...fallbackUrls.http.map((url) => http(url)),
		])
	})

export function getWagmiConfig() {
	if (wagmiConfigSingleton) return wagmiConfigSingleton
	const chain = getTempoChain()
	const transport = getTempoTransport()

	wagmiConfigSingleton = createConfig({
		ssr: true,
		multiInjectedProviderDiscovery: true,
		chains: [chain, tempoLocalnet],
		connectors: [tempoWallet()],
		storage: createStorage({ storage: cookieStorage }),
		transports: {
			[chain.id]: transport,
			[tempoLocalnet.id]: http(undefined, { batch: true }),
		} as never,
	})

	return wagmiConfigSingleton
}

export const getWagmiStateSSR = createServerFn().handler(() => {
	const cookie = getRequestHeader('cookie')
	const initialState = cookieToInitialState(getWagmiConfig(), cookie)
	return serialize(initialState || {})
})

// Batched HTTP client for bulk RPC operations
export function getBatchedClient() {
	const chain = getTempoChain()
	const transport = getTempoTransport()

	return createPublicClient({ chain, transport }).extend(tempoActions())
}

declare module 'wagmi' {
	interface Register {
		config: ReturnType<typeof getWagmiConfig>
	}
}
