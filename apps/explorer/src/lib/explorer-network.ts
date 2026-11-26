import type { TempoEnv } from './env'

/**
 * Networks offered in the header switcher.
 *
 * NVNM chains only — Tempo's public networks are not served by this build.
 */
export const EXPLORER_NETWORK_OPTIONS = [
	{
		env: 'nvnm-mainnet',
		label: 'NVNM Mainnet',
		host: 'https://scan.nvnm.mainnet.nvnmchain.io',
		dotClassName: 'bg-positive',
	},
	{
		env: 'nvnm-testnet',
		label: 'NVNM Testnet',
		host: 'https://scan.nvnm.testnet.nvnmchain.io',
		dotClassName: 'bg-amber-400',
	},
	{
		env: 'nvnm',
		label: 'NVNM Devnet',
		host: 'https://scan.nvnm.canary.mantrachain.dev',
		dotClassName: 'bg-amber-400',
	},
] as const

export function getActiveExplorerNetworkOption(tempoEnv: TempoEnv) {
	const option = EXPLORER_NETWORK_OPTIONS.find(
		(candidate) => candidate.env === tempoEnv,
	)
	if (!option) throw new Error(`Unknown explorer network: ${tempoEnv}`)
	return option
}

export function buildExplorerNetworkHref(
	host: string,
	path: string,
	options?: buildExplorerNetworkHref.Options,
): string {
	const targetPath = options?.fallbackToHome ? '/' : path
	return `${host}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`
}

export namespace buildExplorerNetworkHref {
	export interface Options {
		fallbackToHome?: boolean
	}
}

export function isExplorerNetworkPathPreservable(path: string): boolean {
	const pathname = path.split(/[?#]/, 1)[0]

	return [
		/^\/$/,
		/^\/blocks\/?$/,
		/^\/tokens\/?$/,
		/^\/fee-amm\/?$/,
		/^\/tx\/[^/]+\/?$/,
		/^\/receipt\/[^/]+\/?$/,
		/^\/block\/[^/]+\/?$/,
		/^\/block\/countdown\/[^/]+\/?$/,
		/^\/address\/[^/]+\/?$/,
		/^\/token\/[^/]+\/?$/,
	].some((pattern) => pattern.test(pathname))
}
