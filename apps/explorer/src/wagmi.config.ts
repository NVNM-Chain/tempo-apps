import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest, getRequestHeader } from '@tanstack/react-start/server'
import { createClient, createPublicClient, type Transport } from 'viem'
import { tempoActions } from 'viem/tempo'
import { loadBalance, rateLimit } from '@tempo/rpc-utils'
import { nvnmChainByEnv } from './lib/chains'
import { getTempoEnv } from './lib/env'
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
// On the server, one RPC client per incoming request: viem batches and
// dedupes in-flight RPC calls in module-global caches keyed by client and URL,
// so a client shared across requests lets one request await a promise settled
// by another request's fetch, which the Workers runtime cancels as hung. The
// config itself (connectors, store) stays one per isolate: building it sets up
// the wallet connector, which registers itself in a module-global set.
const serverWagmiConfigs = new WeakMap<
	Request,
	ReturnType<typeof createConfig>
>()

/**
 * The one chain this deployment serves, by its env. Kept behind
 * createIsomorphicFn so the call sites (and the client/server split) stay
 * identical to upstream.
 */
export const getTempoChain = createIsomorphicFn()
	.client(() => nvnmChainByEnv[getTempoEnv()])
	.server(() => nvnmChainByEnv[getTempoEnv()])

/** The chain's own RPC: NVNM has no RPC proxy, so the browser calls it too. */
function getRpcUrl() {
	return getTempoChain().rpcUrls.default.http[0]
}

function rpcHttp(
	url: string | undefined,
	options: { headers?: Record<string, string> | undefined; timeout: number },
) {
	return http(url, {
		batch: { batchSize: 50 },
		fetchOptions: { headers: options.headers, redirect: 'manual' },
		timeout: options.timeout,
	})
}

const getTempoTransport = createIsomorphicFn()
	.client(() =>
		loadBalance([rateLimit(http(getRpcUrl()), { requestsPerSecond: 20 })]),
	)
	.server(() => withOwnBatch(rpcHttp(getRpcUrl(), { timeout: 15_000 })))

/**
 * viem queues batched calls by URL and the call's AbortSignal, across every
 * client in the isolate. Giving each client its own signal keeps a request's
 * calls in batches that request's own fetch sends.
 */
function withOwnBatch(transport: Transport): Transport {
	return (config) => {
		const value = transport(config)
		const signal = new AbortController().signal
		return {
			...value,
			request: (args, options) =>
				value.request(args, { ...options, signal: options?.signal ?? signal }),
		} as ReturnType<Transport>
	}
}

const getCurrentRequest = createIsomorphicFn()
	.client((): Request | undefined => undefined)
	.server((): Request | undefined => {
		try {
			return getRequest()
		} catch {
			return undefined
		}
	})

export function getWagmiConfig() {
	if (typeof window === 'undefined') {
		const request = getCurrentRequest()
		const cached = request && serverWagmiConfigs.get(request)
		if (cached) return cached
		const config = withOwnClients(getSharedWagmiConfig())
		if (request) serverWagmiConfigs.set(request, config)
		return config
	}
	return getSharedWagmiConfig()
}

function getSharedWagmiConfig() {
	if (wagmiConfigSingleton) return wagmiConfigSingleton
	wagmiConfigSingleton = createWagmiConfig()
	return wagmiConfigSingleton
}

/**
 * A view of `config` whose `getClient` builds and memoizes its own viem clients
 * (as wagmi's `createConfig` does), leaving everything else shared.
 */
function withOwnClients(
	config: ReturnType<typeof createConfig>,
): ReturnType<typeof createConfig> {
	const clients = new Map<number, ReturnType<typeof createClient>>()
	const view = Object.create(config) as ReturnType<typeof createConfig>
	view.getClient = ((parameters: { chainId?: number | undefined } = {}) => {
		const chainId = parameters.chainId ?? config.state.chainId
		const chain = config.chains.find((x) => x.id === chainId)
		if (!chain) return config.getClient(parameters as never)
		let client = clients.get(chain.id)
		if (!client) {
			client = createClient({
				batch: { multicall: true },
				chain,
				transport: getTempoTransport(),
			})
			clients.set(chain.id, client)
		}
		return client
	}) as never
	return view
}

function createWagmiConfig(): ReturnType<typeof createConfig> {
	const chain = getTempoChain()
	const transport = getTempoTransport()

	return createConfig({
		ssr: true,
		multiInjectedProviderDiscovery: true,
		chains: [chain],
		connectors: [tempoWallet({ name: 'NVNMChain Wallet' })],
		storage: createStorage({ storage: cookieStorage }),
		transports: {
			[chain.id]: transport,
		} as never,
	})
}

// The root route's loader runs again on every preload, so read the cookie
// where it already is instead of calling a server function: the request
// header on the server and document.cookie in the browser.
const getWagmiCookie = createIsomorphicFn()
	.client(() => document.cookie)
	.server(() => getRequestHeader('cookie'))

export function getWagmiState() {
	const initialState = cookieToInitialState(getWagmiConfig(), getWagmiCookie())
	return serialize(initialState || {})
}

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
