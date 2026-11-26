import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { detectProxy } from '#lib/domain/proxy'

const PROXY = '0x1111111111111111111111111111111111111111'
const IMPLEMENTATION = getAddress('0xfb1bffc9d739b8d520daf37df666da4c687191ea')

/** A node holding `code` at the proxy and `slots` in its storage. */
function client(code: string, slots: Record<string, string> = {}) {
	return {
		getCode: async () => code as `0x${string}`,
		getStorageAt: async ({ slot }: { slot: string }) =>
			(slots[slot] ?? `0x${'0'.repeat(64)}`) as `0x${string}`,
		readContract: async () => {
			throw new Error('no implementation()')
		},
	}
}

const word = (address: string) =>
	`0x${address.slice(2).toLowerCase().padStart(64, '0')}`

describe('detectProxy', () => {
	it('reads an EIP-1167 clone’s implementation from its code', async () => {
		const clone = `0x363d3d373d3d3d363d73${IMPLEMENTATION.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`
		expect(await detectProxy(client(clone), PROXY)).toEqual({
			isProxy: true,
			type: 'EIP-1167',
			implementationAddress: IMPLEMENTATION,
		})
	})

	it('reads a Safe proxy’s singleton from slot 0', async () => {
		// Safe v1.3.0's proxy runtime.
		const safe =
			'0x608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea2646970667358221220d1429297349653a4918076d650332de1a1068c5f3e07c5c82360c277770b955264736f6c63430007060033'
		expect(
			await detectProxy(client(safe, { '0x0': word(IMPLEMENTATION) }), PROXY),
		).toEqual({
			isProxy: true,
			type: 'Safe',
			implementationAddress: IMPLEMENTATION,
		})
	})

	it('leaves other contracts alone', async () => {
		expect(await detectProxy(client('0x6080604052'), PROXY)).toEqual({
			isProxy: false,
		})
	})
})
