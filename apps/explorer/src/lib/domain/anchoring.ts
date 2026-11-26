/** NVNM's anchoring contract. Chains without it have no code here, so no registries. */
export const ANCHORING_ADDRESS = '0x0000000000000000000000000000000000000a00'

/** What `ANCHORING_ADDRESS` delegates to since T12, at the same CREATE2 address on every chain. */
export const ANCHORING_IMPLEMENTATION =
	'0xf873bbd8b4ed0580425592a37b218bc46a628c70'

export const ANCHORING_PER_PAGE = 25

export type AnchoringRegistry = {
	id: number
	name: string
	description: string
	creator: string
	createdAt: string
	metadata: string
}

/** One version of a record; `index` is its version number. */
export type AnchoringRecord = {
	uri: string
	checksum: string
	checksumAlgo: string
	metadata: string
	timestamp: string
	status: string
	recordId: number
	index: number
	isLatest: boolean
	registryId: number
}

/** A registry's event, as the indexer decodes it; `recordId` for a record's events. */
export type AnchoringEvent = {
	event: string
	recordId: number | undefined
	caller: string
	transactionHash: string
	blockNumber: number
	logIndex: number
}

/** A registry or record id: ids run from 1. */
export function parseAnchoringId(value: string): number | undefined {
	if (!/^[1-9]\d*$/.test(value)) return undefined
	const id = Number(value)
	return Number.isSafeInteger(id) ? id : undefined
}
