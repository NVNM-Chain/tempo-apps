import { nvnmChainById } from '#lib/chains'

export function getFeeTokenForChain(
	chainId: number,
): `0x${string}` | undefined {
	return nvnmChainById(chainId)?.feeToken
}
