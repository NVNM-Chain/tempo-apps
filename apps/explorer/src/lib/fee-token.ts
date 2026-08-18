const FEE_TOKEN_BY_CHAIN_ID: Record<number, `0x${string}`> = {
	787222: '0x20c0000000000000000000000000000000000000',
}

export function getFeeTokenForChain(
	chainId: number,
): `0x${string}` | undefined {
	return FEE_TOKEN_BY_CHAIN_ID[chainId]
}
