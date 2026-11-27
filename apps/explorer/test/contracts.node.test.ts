import { describe, expect, it } from 'vitest'
import {
	parseAbiItem,
	toEventSelector,
	toFunctionSelector,
	type Abi,
} from 'viem'
import { getAccountTag } from '#lib/account'
import {
	getContractAbi,
	getContractInfo,
	knownSignature,
	getFunctionSelector,
	getReadFunctions,
	getWriteFunctions,
} from '#lib/domain/contracts'

const proxyImplementationAbi = [
	{
		type: 'function',
		name: 'supportsInterface',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'interfaceId', type: 'bytes4' }],
		outputs: [{ name: '', type: 'bool' }],
	},
	{
		type: 'function',
		name: 'reserveStores',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'token', type: 'address' }],
		outputs: [{ name: '', type: 'address' }],
	},
	{
		type: 'function',
		name: 'BURNER_ROLE',
		stateMutability: 'nonpayable',
		inputs: [],
		outputs: [{ name: '', type: 'bytes32' }],
	},
	{
		type: 'function',
		name: 'MINT_RATE_LIMIT_SETTER_ROLE',
		stateMutability: 'nonpayable',
		inputs: [],
		outputs: [{ name: '', type: 'bytes32' }],
	},
	{
		type: 'function',
		name: 'minterAllowances',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'minter', type: 'address' },
			{ name: 'token', type: 'address' },
		],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'mintTxnLimits',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'minter', type: 'address' }],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'mint',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'amount', type: 'uint256' }],
		outputs: [],
	},
	{
		type: 'function',
		name: 'setMinterAllowance',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'amount', type: 'uint256' }],
		outputs: [],
	},
] as const satisfies Abi

const whatsabiImplementationAbi = proxyImplementationAbi.map((fn, index) => ({
	...fn,
	selector: `0x${index.toString(16).padStart(8, '0')}`,
})) as Abi

describe('contract function classification', () => {
	it('keeps getter-style implementation functions out of Write', () => {
		for (const abi of [proxyImplementationAbi, whatsabiImplementationAbi]) {
			const reads = getReadFunctions(abi)
			const writes = getWriteFunctions(abi)

			expect(reads.map((fn) => fn.name)).toEqual([
				'supportsInterface',
				'reserveStores',
				'BURNER_ROLE',
				'MINT_RATE_LIMIT_SETTER_ROLE',
				'minterAllowances',
				'mintTxnLimits',
			])
			expect(writes.map((fn) => fn.name)).toEqual([
				'mint',
				'setMinterAllowance',
			])
		}
	})
})

describe('anchoring contract', () => {
	it('names the proxy and its implementation, and decodes their calls', () => {
		for (const [address, name] of [
			['0x0000000000000000000000000000000000000A00', 'Anchoring'],
			[
				'0xF873bbD8B4ed0580425592a37b218BC46A628C70',
				'Anchoring Implementation',
			],
		] as const)
			expect(getContractInfo(address)?.name).toBe(name)
		const abi = getContractAbi('0x0000000000000000000000000000000000000a00')
		expect(abi).toBeDefined()
		// `addRegistry` and `addRecord` as canary transactions carry them.
		for (const [selector, name] of [
			['0x318b38b1', 'addRegistry'],
			['0x64d25295', 'addRecord'],
		] as const)
			expect(
				(abi ?? []).some(
					(item) =>
						item.type === 'function' &&
						item.name === name &&
						getFunctionSelector(item) === selector,
				),
			).toBe(true)
	})
})

describe('NVNM genesis token metadata', () => {
	it('names the genesis token nUSD and lists no Tempo tokens', () => {
		expect(
			getContractInfo('0x20c0000000000000000000000000000000000000')?.name,
		).toBe('nUSD')
		expect(
			getAccountTag('0x20c0000000000000000000000000000000000000')?.label,
		).toBe('nUSD')
		expect(
			getAccountTag('0x20c0000000000000000000000000000000000001'),
		).toBeUndefined()
	})
})

describe('known signatures', () => {
	it.each([
		['function', '0x64d25295'], // addRecord, as a transaction page asked for it
		[
			'event',
			'0x1a3295fa8cc0e28c95d21912c9e6958f3bc740231781f7640ad885c972a352fd',
		], // AddRecord
		[
			'event',
			'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
		], // Transfer
	] as const)('answers a %s selector the explorer knows: %s', (kind, selector) => {
		const signature = knownSignature(selector)
		expect(signature).toBeDefined()
		const item = parseAbiItem(`${kind} ${signature}`)
		expect(
			item.type === 'function'
				? toFunctionSelector(item)
				: toEventSelector(item as never),
		).toBe(selector)
	})

	it('leaves an unknown selector to the public directories', () => {
		expect(knownSignature('0xdeadbeef')).toBeUndefined()
	})
})
