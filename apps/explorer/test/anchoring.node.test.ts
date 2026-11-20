import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod/mini'
import {
	fetchAnchoringRecord,
	fetchAnchoringRegistries,
	fetchAnchoringRegistry,
	newestFirst,
	searchAnchoring,
} from '#lib/server/anchoring'

vi.mock('@tanstack/react-start', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-start')>()),
	createServerFn: () => ({
		inputValidator: (schema: z.ZodMiniType) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: z.parse(schema, input.data) }),
		}),
	}),
}))

const { getStorageAt, readContract, request, indexer } = vi.hoisted(() => ({
	getStorageAt: vi.fn(),
	readContract: vi.fn(),
	request: vi.fn(),
	indexer: vi.fn(),
}))
vi.mock('#wagmi.config', () => ({
	getBatchedClient: () => ({
		chain: { id: 31318 },
		getStorageAt,
		readContract,
		request,
	}),
}))
vi.mock('#lib/server/dex-indexer', () => ({ indexer }))

/** `_recordCount[1]` and `[2]`: `keccak256(abi.encode(id, 5))`, worked out apart from the code. */
const RECORD_COUNTS: Record<string, bigint> = {
	'0x1471eb6eb2c5e789fc3de43f8ce62938c7d1836ec861730447e2ada8fd81017b': 27n,
	'0x89832631fb3c3307a103ba2c84ab569c64d6182a18893dcd163f0f1c2090733a': 1n,
}

const word = (value: bigint) =>
	`0x${value.toString(16).padStart(64, '0')}` as const

function registry(id: bigint) {
	return {
		id,
		// Two share a name, as names are not unique.
		name: id === 2n || id === 3n ? 'twin' : `reg-${id}`,
		description: '',
		creator: 'nvnm1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqzctpdvkkn',
		createdAt: '2025-09-09 00:00:00 +0000 UTC',
		metadata: '{}',
	}
}

const versionsOf = (registryId: bigint, recordId: bigint) =>
	registryId === 1n && recordId === 1n ? 30n : 1n

/** Version `index` of a record; 0 is the latest. Registry 2's record shares registry 1's first checksum. */
function record(registryId: bigint, recordId: bigint, index: bigint) {
	const latest = versionsOf(registryId, recordId)
	const version = index === 0n ? latest : index
	return {
		uri: `https://ex.test/${registryId}/${recordId}/${version}`,
		checksum: `sum-${recordId}`,
		checksumAlgo: 'sha256',
		metadata: '{}',
		timestamp: '2025-09-09 00:00:00 +0000 UTC',
		status: 'Active',
		recordId,
		index: version,
		isLatest: version === latest,
		registryId,
	}
}

type Page = { offset: bigint; limit: bigint; reverse: boolean }
const page = { nextKey: '0x', total: 0n }

/** The anchoring contract with `registries` registries, registry 1 holding 27 records. */
function contract(registries: bigint) {
	getStorageAt.mockImplementation(async ({ slot }: { slot: string }) =>
		BigInt(slot) === 3n
			? word((registries << 160n) | 0xa0n)
			: word(RECORD_COUNTS[slot] ?? 0n),
	)
	readContract.mockImplementation(
		async ({
			functionName,
			args,
		}: {
			functionName: string
			args: unknown[]
		}) => {
			if (functionName === 'registries') {
				const [id, p] = args as [bigint, Page]
				if (id !== 0n) return [[registry(id)], page]
				expect(p.reverse).toBe(true)
				const ids = []
				for (let i = registries - p.offset; i > 0n && ids.length < p.limit; i--)
					ids.push(i)
				return [ids.map(registry), page]
			}
			if (functionName === 'registriesByName') {
				const [name, matchMode] = args as [string, number]
				expect(matchMode).toBe(1)
				const ids = Array.from({ length: Number(registries) }, (_, i) =>
					BigInt(i + 1),
				)
				return [ids.map(registry).filter((r) => r.name === name), page]
			}
			if (functionName === 'records') {
				const [registryId, checksum, recordId, index, p] = args as [
					bigint,
					string,
					bigint,
					bigint,
					Page,
				]
				if (registryId === 0n)
					return [
						checksum === 'sum-1'
							? [record(1n, 1n, 0n), record(2n, 1n, 0n)]
							: [],
						page,
					]
				if (recordId !== 0n)
					return [[record(registryId, recordId, index)], page]
				const ids = Array.from(
					{ length: Number(p.limit) },
					(_, i) => BigInt(i + 1) + p.offset,
				)
				return [ids.map((id) => record(registryId, id, 0n)), page]
			}
			throw new Error(`unexpected ${functionName}`)
		},
	)
}

/** A node started with `--anchoring.name-index`: the names containing the query, by id. */
function nameIndex(registries: bigint) {
	request.mockImplementation(
		async ({ method, params }: { method: string; params: unknown[] }) => {
			expect(method).toBe('anchoring_searchRegistriesByName')
			const [{ name, mode, limit }] = params as [
				{ name: string; mode: string; limit: number },
			]
			expect(mode).toBe('contains')
			const rows = []
			for (let id = 1n; id <= registries && rows.length < limit; id++) {
				const row = registry(id)
				if (row.name.toLowerCase().includes(name.toLowerCase()))
					rows.push({ ...row, id: Number(id) })
			}
			return { registries: rows, nextKey: null }
		},
	)
}

beforeEach(() => {
	vi.resetAllMocks()
	contract(30n)
	// Most nodes run no name index.
	request.mockRejectedValue(new Error('Method not found'))
	indexer.mockResolvedValue([])
})

const ids = (rows: { id: number }[]) => rows.map((r) => r.id)

describe('anchoring', () => {
	it('pages newest first', () => {
		expect(newestFirst(30, 1, 25)).toEqual(
			Array.from({ length: 25 }, (_, i) => 30 - i),
		)
		expect(newestFirst(30, 2, 25)).toEqual([5, 4, 3, 2, 1])
		expect(newestFirst(30, 3, 25)).toEqual([])
		expect(newestFirst(0, 1, 25)).toEqual([])
	})

	it('lists registries newest first', async () => {
		const first = await fetchAnchoringRegistries({ data: { page: 1 } })
		expect(first.total).toBe(30)
		expect(ids(first.registries)).toEqual(newestFirst(30, 1, 25))
		const second = await fetchAnchoringRegistries({ data: { page: 2 } })
		expect(ids(second.registries)).toEqual([5, 4, 3, 2, 1])
	})

	it('asks nothing of a chain without the contract', async () => {
		contract(0n)
		expect(await fetchAnchoringRegistries({ data: { page: 1 } })).toEqual({
			registries: [],
			total: 0,
		})
		expect(await searchAnchoring({ data: { q: 'twin' } })).toEqual({
			registries: [],
			records: [],
		})
		expect(readContract).not.toHaveBeenCalled()
	})

	it('lists a registry’s records newest first', async () => {
		const first = await fetchAnchoringRegistry({
			data: { registryId: 1, page: 1 },
		})
		expect(first?.registry.name).toBe('reg-1')
		expect(first?.total).toBe(27)
		expect(first?.records.map((r) => r.recordId)).toEqual(
			newestFirst(27, 1, 25),
		)
		const second = await fetchAnchoringRegistry({
			data: { registryId: 1, page: 2 },
		})
		expect(second?.records.map((r) => r.recordId)).toEqual([2, 1])
		expect(
			await fetchAnchoringRegistry({ data: { registryId: 31, page: 1 } }),
		).toBeNull()
	})

	it('lists a record’s versions newest first', async () => {
		const found = await fetchAnchoringRecord({
			data: { registryId: 1, recordId: 1, page: 2 },
		})
		expect(found?.latest.index).toBe(30)
		expect(found?.versions.map((v) => v.index)).toEqual([5, 4, 3, 2, 1])
		expect(found?.versions[4]?.isLatest).toBe(false)
		expect(
			await fetchAnchoringRecord({
				data: { registryId: 1, recordId: 28, page: 1 },
			}),
		).toBeNull()
		expect(
			await fetchAnchoringRecord({
				data: { registryId: 31, recordId: 1, page: 1 },
			}),
		).toBeNull()
	})

	it('finds registries by whole name and records by checksum', async () => {
		const found = await searchAnchoring({ data: { q: 'twin' } })
		expect(ids(found.registries)).toEqual([2, 3])
		const anchored = await searchAnchoring({ data: { q: 'sum-1' } })
		expect(anchored.records.map((r) => r.registryId)).toEqual([1, 2])
	})

	it('finds part of a name on a node running the name index', async () => {
		const search = async (q: string, limit?: number) =>
			ids((await searchAnchoring({ data: { q, limit } })).registries)
		// The contract alone matches a whole name.
		expect(await search('reg-1')).toEqual([1])
		expect(await search('eg-1')).toEqual([])
		nameIndex(30n)
		// The name typed, then the names it begins, each by id.
		expect(await search('reg-1')).toEqual([
			1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
		])
		expect(await search('eg-2', 3)).toEqual([20, 21, 22])
	})

	it('lists a registry’s events from the indexer, newest first', async () => {
		indexer.mockImplementation(async (_chainId: number, sql: string) =>
			sql.includes('FROM AddRecord')
				? [
						{
							tx_hash: '0xb',
							block_num: 9,
							log_idx: 1,
							caller: '0xc',
							recordId: 2,
						},
						{
							tx_hash: '0xa',
							block_num: 7,
							log_idx: 0,
							caller: '0xc',
							recordId: 1,
						},
					]
				: sql.includes('FROM AddRegistry')
					? [{ tx_hash: '0x9', block_num: 5, log_idx: 0, caller: '0xc' }]
					: [],
		)
		const found = await fetchAnchoringRegistry({
			data: { registryId: 1, page: 1 },
		})
		expect(
			found?.events?.map((e) => [e.event, e.recordId, e.blockNumber]),
		).toEqual([
			['AddRecord', 2, 9],
			['AddRecord', 1, 7],
			['AddRegistry', undefined, 5],
		])
		// One query per event that names a registry, each for this registry.
		expect(indexer).toHaveBeenCalledTimes(5)
		for (const [, sql] of indexer.mock.calls)
			expect(sql).toContain('registryId = 1')

		indexer.mockRejectedValue(new Error('Indexer query failed (402)'))
		const without = await fetchAnchoringRegistry({
			data: { registryId: 1, page: 1 },
		})
		expect(without?.events).toBeNull()
		expect(without?.records).toHaveLength(25)
	})
})
