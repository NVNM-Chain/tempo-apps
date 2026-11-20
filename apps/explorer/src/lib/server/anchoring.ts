import { createServerFn } from '@tanstack/react-start'
import { formatAbiItem } from 'abitype'
import { encodeAbiParameters, keccak256, toHex } from 'viem'
import * as z from 'zod/mini'
import { anchoringAbi } from '#lib/abis'
import {
	ANCHORING_ADDRESS,
	ANCHORING_PER_PAGE,
	type AnchoringEvent,
	type AnchoringRecord,
	type AnchoringRegistry,
} from '#lib/domain/anchoring'
import { indexer } from '#lib/server/dex-indexer'
import { getBatchedClient } from '#wagmi.config'

// Registries and records are read from the node rather than an index: the ones seeded at
// genesis emitted no events.

const contract = { address: ANCHORING_ADDRESS, abi: anchoringAbi } as const

/** The events that name a registry. */
const registryEvents = anchoringAbi.filter(
	(item): item is Extract<typeof item, { type: 'event' }> =>
		item.type === 'event' &&
		item.inputs.some((input) => input.name === 'registryId'),
)

/** The contract's first page, at its default size. */
const FIRST_PAGE = {
	key: '0x',
	offset: 0n,
	limit: 0n,
	countTotal: false,
	reverse: false,
} as const

type Client = ReturnType<typeof getBatchedClient>

/** A storage word, for the two counts no view returns: the migration's layout. */
async function word(client: Client, slot: `0x${string}`) {
	const value = await client.getStorageAt({ address: ANCHORING_ADDRESS, slot })
	return BigInt(value ?? 0)
}

/** `_registryCount`, above `_formerAdmin` in slot 3. Ids run `1..count`. */
async function registryCount(client: Client) {
	return Number((await word(client, toHex(3, { size: 32 }))) >> 160n)
}

/** `_recordCount[registryId]`, the mapping at slot 5. Ids run `1..count`. */
async function recordCount(client: Client, registryId: number) {
	const slot = keccak256(
		encodeAbiParameters(
			[{ type: 'uint256' }, { type: 'uint256' }],
			[BigInt(registryId), 5n],
		),
	)
	return Number(await word(client, slot))
}

/** The ids on 1-based page `page` of `1..total` listed newest first; none past the end. */
export function newestFirst(total: number, page: number, perPage: number) {
	const last = total - (page - 1) * perPage
	if (last < 1) return []
	const first = Math.max(1, last - perPage + 1)
	return Array.from({ length: last - first + 1 }, (_, i) => last - i)
}

function registryOf(
	registry: Omit<AnchoringRegistry, 'id'> & { id: bigint },
): AnchoringRegistry {
	return { ...registry, id: Number(registry.id) }
}

function recordOf(
	record: Omit<AnchoringRecord, 'recordId' | 'index' | 'registryId'> & {
		recordId: bigint
		index: bigint
		registryId: bigint
	},
): AnchoringRecord {
	return {
		...record,
		recordId: Number(record.recordId),
		index: Number(record.index),
		registryId: Number(record.registryId),
	}
}

/** Registries newest first, and how many there are. */
export const fetchAnchoringRegistries = createServerFn({ method: 'POST' })
	.inputValidator(z.object({ page: z.number() }))
	.handler(async ({ data }) => {
		const client = getBatchedClient()
		const total = await registryCount(client)
		// Nor may there be a contract to ask.
		if (total === 0) return { registries: [], total }
		const [registries] = await client.readContract({
			...contract,
			functionName: 'registries',
			args: [
				0n,
				{
					...FIRST_PAGE,
					offset: BigInt((data.page - 1) * ANCHORING_PER_PAGE),
					limit: BigInt(ANCHORING_PER_PAGE),
					reverse: true,
				},
			],
		})
		return { registries: registries.map(registryOf), total }
	})

/** The most the name index returns at once. */
const NAME_INDEX_LIMIT = 200

/** Registries whose name contains `q`, by id; none unless the node runs `--anchoring.name-index`. */
async function nameIndex(client: Client, q: string, limit: number) {
	try {
		const answer = (await client.request({
			method: 'anchoring_searchRegistriesByName',
			params: [{ name: q, mode: 'contains', limit }],
		} as never)) as { registries: AnchoringRegistry[] }
		return answer.registries
	} catch {
		return []
	}
}

/** The name typed first, then the names beginning with it, then the rest, each by id. */
function rankByName(registries: AnchoringRegistry[], q: string) {
	const lower = q.toLowerCase()
	const tier = ({ name }: AnchoringRegistry) => {
		const lowered = name.toLowerCase()
		return lowered === lower ? 0 : lowered.startsWith(lower) ? 1 : 2
	}
	return registries.toSorted((a, b) => tier(a) - tier(b) || a.id - b.id)
}

/**
 * Registries whose name is or contains `q`, and the latest version of each record with
 * checksum `q`; at most `limit` of each when given.
 */
export const searchAnchoring = createServerFn({ method: 'POST' })
	.inputValidator(z.object({ q: z.string(), limit: z.optional(z.number()) }))
	.handler(({ data }) => findAnchoring(data.q, data.limit))

export async function findAnchoring(
	q: string,
	limit?: number,
): Promise<{ registries: AnchoringRegistry[]; records: AnchoringRecord[] }> {
	const client = getBatchedClient()
	if ((await registryCount(client)) === 0)
		return { registries: [], records: [] }
	// The index answers by id, so the name typed can sit behind names that contain it.
	const asked = Math.min(NAME_INDEX_LIMIT, (limit ?? Infinity) * 8)
	const [[named], [anchored], partial] = await Promise.all([
		client.readContract({
			...contract,
			functionName: 'registriesByName',
			args: [q, 1, FIRST_PAGE],
		}),
		client.readContract({
			...contract,
			functionName: 'records',
			args: [0n, q, 0n, 0n, FIRST_PAGE],
		}),
		nameIndex(client, q, asked),
	])
	const byId = new Map(
		[...named.map(registryOf), ...partial].map((r) => [r.id, r]),
	)
	return {
		registries: rankByName([...byId.values()], q).slice(0, limit),
		records: anchored.map(recordOf).slice(0, limit),
	}
}

/**
 * A registry's latest events, newest first, decoded by the indexer; `null` when the indexer
 * cannot answer.
 */
async function fetchRegistryEvents(
	chainId: number,
	registryId: number,
	limit: number,
): Promise<AnchoringEvent[] | null> {
	try {
		const found = await Promise.all(
			registryEvents.map(async (event) => {
				const withRecord = event.inputs.some(
					(input) => input.name === 'recordId',
				)
				const rows = await indexer(
					chainId,
					`SELECT tx_hash, block_num, log_idx, caller${withRecord ? ', recordId' : ''}
					FROM ${event.name} WHERE address = '${ANCHORING_ADDRESS}' AND registryId = ${registryId}
					ORDER BY block_num DESC, log_idx DESC LIMIT ${limit}`,
					formatAbiItem(event).replace(/^event /, ''),
				)
				return rows.map((row) => ({
					event: event.name,
					recordId: withRecord ? Number(row.recordId) : undefined,
					caller: String(row.caller),
					transactionHash: String(row.tx_hash),
					blockNumber: Number(row.block_num),
					logIndex: Number(row.log_idx),
				}))
			}),
		)
		return found
			.flat()
			.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
			.slice(0, limit)
	} catch (error) {
		console.error('Failed to read anchoring events:', error)
		return null
	}
}

/**
 * A registry, the latest version of each of its records newest first, how many records it
 * has, and its latest events: one past a page, to tell there are more.
 */
export const fetchAnchoringRegistry = createServerFn({ method: 'POST' })
	.inputValidator(z.object({ registryId: z.number(), page: z.number() }))
	.handler(async ({ data }) => {
		const client = getBatchedClient()
		const [count, total] = await Promise.all([
			registryCount(client),
			recordCount(client, data.registryId),
		])
		if (data.registryId < 1 || data.registryId > count) return null
		const ids = newestFirst(total, data.page, ANCHORING_PER_PAGE)
		const oldest = ids.at(-1)
		const [[registries], records, events] = await Promise.all([
			client.readContract({
				...contract,
				functionName: 'registries',
				args: [BigInt(data.registryId), FIRST_PAGE],
			}),
			oldest === undefined
				? []
				: client
						.readContract({
							...contract,
							functionName: 'records',
							args: [
								BigInt(data.registryId),
								'',
								0n,
								0n,
								{
									...FIRST_PAGE,
									offset: BigInt(oldest - 1),
									limit: BigInt(ids.length),
								},
							],
						})
						.then(([rows]) => rows.map(recordOf).reverse()),
			fetchRegistryEvents(
				client.chain.id,
				data.registryId,
				ANCHORING_PER_PAGE + 1,
			),
		])
		const registry = registries[0]
		if (!registry) throw new Error(`registry ${data.registryId} not returned`)
		return { registry: registryOf(registry), records, total, events }
	})

/** A record's latest version, and its versions newest first. The latest's `index` is how many there are. */
export const fetchAnchoringRecord = createServerFn({ method: 'POST' })
	.inputValidator(
		z.object({
			registryId: z.number(),
			recordId: z.number(),
			page: z.number(),
		}),
	)
	.handler(async ({ data }) => {
		const client = getBatchedClient()
		const total = await recordCount(client, data.registryId)
		if (data.recordId < 1 || data.recordId > total) return null
		const version = (index: number) =>
			client
				.readContract({
					...contract,
					functionName: 'records',
					args: [
						BigInt(data.registryId),
						'',
						BigInt(data.recordId),
						BigInt(index),
						FIRST_PAGE,
					],
				})
				.then(([rows]) => rows.map(recordOf))
		// Index 0 asks for the latest.
		const [latest] = await version(0)
		if (!latest)
			throw new Error(`record ${data.registryId}/${data.recordId} not returned`)
		const ids = newestFirst(latest.index, data.page, ANCHORING_PER_PAGE)
		const versions = (await Promise.all(ids.map(version))).flat()
		return { latest, versions }
	})
