import type { Address, Hex } from 'ox'
import { getAddress, type Abi } from 'viem'

// EIP-1967 storage slots
const IMPLEMENTATION_SLOT =
	'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const
const BEACON_SLOT =
	'0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' as const

// EIP-1822 (UUPS) slot
const PROXIABLE_SLOT =
	'0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7' as const

// An EIP-1167 clone's whole runtime: the implementation's address between these.
const EIP1167_HEAD = '363d3d373d3d3d363d73'
const EIP1167_TAIL = '5af43d82803e903d91602b57fd5bf3'

// The word a Safe proxy compares calldata with to answer `masterCopy()` from slot 0.
const SAFE_MASTER_COPY = `a619486e${'0'.repeat(56)}`

// Common proxy function ABIs
const IMPLEMENTATION_ABI = [
	{
		inputs: [],
		name: 'implementation',
		outputs: [{ name: '', type: 'address' }],
		stateMutability: 'view',
		type: 'function',
	},
] as const

const BEACON_IMPLEMENTATION_ABI = [
	{
		inputs: [],
		name: 'childImplementation',
		outputs: [{ name: '', type: 'address' }],
		stateMutability: 'view',
		type: 'function',
	},
] as const

export type ProxyType =
	| 'EIP-1967'
	| 'EIP-1822'
	| 'EIP-1167'
	| 'Beacon'
	| 'Safe'
	| 'Legacy'

export type ProxyInfo = {
	isProxy: boolean
	type?: ProxyType
	implementationAddress?: Address.Address
	beaconAddress?: Address.Address
}

// Use a generic client type that works with wagmi's PublicClient
type Client = {
	getCode: (args: {
		address: `0x${string}`
	}) => Promise<`0x${string}` | undefined>
	getStorageAt: (args: {
		address: `0x${string}`
		slot: `0x${string}`
	}) => Promise<`0x${string}` | undefined>
	// biome-ignore lint/suspicious/noExplicitAny: wagmi client type compatibility
	readContract: (args: any) => Promise<unknown>
}

function extractAddressFromSlot(
	slotValue: Hex.Hex,
): Address.Address | undefined {
	if (
		!slotValue ||
		slotValue === '0x' ||
		slotValue ===
			'0x0000000000000000000000000000000000000000000000000000000000000000'
	) {
		return undefined
	}
	try {
		// Slot value is 32 bytes, address is last 20 bytes
		const addressHex = `0x${slotValue.slice(-40)}` as `0x${string}`
		const address = getAddress(addressHex)
		if (address === '0x0000000000000000000000000000000000000000') {
			return undefined
		}
		return address as Address.Address
	} catch {
		return undefined
	}
}

async function readStorageSlot(
	client: Client,
	address: Address.Address,
	slot: Hex.Hex,
): Promise<Hex.Hex | null> {
	try {
		const value = await client.getStorageAt({
			address: address as `0x${string}`,
			slot: slot as `0x${string}`,
		})
		return (value as Hex.Hex) || null
	} catch {
		return null
	}
}

async function tryCallImplementation(
	client: Client,
	address: Address.Address,
	abi: readonly unknown[],
): Promise<Address.Address | undefined> {
	try {
		const result = await client.readContract({
			address: address as `0x${string}`,
			abi: abi as Abi,
			functionName: (abi as Array<{ name: string }>)[0].name,
		})
		if (result && typeof result === 'string') {
			return getAddress(result) as Address.Address
		}
	} catch {
		// Method doesn't exist or failed
	}
	return undefined
}

/**
 * Detect if an address is a proxy contract and resolve its implementation.
 */
export async function detectProxy(
	client: Client,
	address: Address.Address,
): Promise<ProxyInfo> {
	const [code, implSlotValue, beaconSlotValue, uupsSlotValue] =
		await Promise.all([
			client.getCode({ address }).catch(() => undefined),
			readStorageSlot(client, address, IMPLEMENTATION_SLOT),
			readStorageSlot(client, address, BEACON_SLOT),
			readStorageSlot(client, address, PROXIABLE_SLOT),
		])
	const bytecode = code?.slice(2).toLowerCase() ?? ''

	// 0. An EIP-1167 clone names its implementation in its code
	if (
		bytecode.length === 90 &&
		bytecode.startsWith(EIP1167_HEAD) &&
		bytecode.endsWith(EIP1167_TAIL)
	)
		return {
			isProxy: true,
			type: 'EIP-1167',
			implementationAddress: getAddress(
				`0x${bytecode.slice(EIP1167_HEAD.length, -EIP1167_TAIL.length)}`,
			) as Address.Address,
		}

	// 1. Check EIP-1967 implementation slot
	if (implSlotValue) {
		const implAddress = extractAddressFromSlot(implSlotValue)
		if (implAddress) {
			return {
				isProxy: true,
				type: 'EIP-1967',
				implementationAddress: implAddress,
			}
		}
	}

	// 2. Check EIP-1967 beacon slot
	if (beaconSlotValue) {
		const beaconAddress = extractAddressFromSlot(beaconSlotValue)
		if (beaconAddress) {
			const [beaconImplAddress, altBeaconImplAddress] = await Promise.all([
				tryCallImplementation(client, beaconAddress, BEACON_IMPLEMENTATION_ABI),
				tryCallImplementation(client, beaconAddress, IMPLEMENTATION_ABI),
			])
			const resolvedAddr = beaconImplAddress ?? altBeaconImplAddress
			if (resolvedAddr) {
				return {
					isProxy: true,
					type: 'Beacon',
					implementationAddress: resolvedAddr,
					beaconAddress,
				}
			}
		}
	}

	// 3. Check EIP-1822 (UUPS) slot
	if (uupsSlotValue) {
		const implAddress = extractAddressFromSlot(uupsSlotValue)
		if (implAddress) {
			return {
				isProxy: true,
				type: 'EIP-1822',
				implementationAddress: implAddress,
			}
		}
	}

	// 4. A Safe proxy keeps its singleton in slot 0
	if (bytecode.includes(SAFE_MASTER_COPY)) {
		const singleton = await readStorageSlot(client, address, '0x0')
		const implAddress = singleton && extractAddressFromSlot(singleton)
		if (implAddress)
			return { isProxy: true, type: 'Safe', implementationAddress: implAddress }
	}

	// 5. Try legacy proxy patterns via function calls
	const legacyImplAddress = await tryCallImplementation(
		client,
		address,
		IMPLEMENTATION_ABI,
	)
	if (legacyImplAddress) {
		return {
			isProxy: true,
			type: 'Legacy',
			implementationAddress: legacyImplAddress,
		}
	}

	return { isProxy: false }
}
