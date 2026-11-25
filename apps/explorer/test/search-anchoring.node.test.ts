import { describe, expect, it, vi } from 'vitest'
import { Route, searchAnchoringResults } from '../src/routes/api/search.ts'

const { findAnchoring, getTransaction, getBlock } = vi.hoisted(() => ({
	findAnchoring: vi.fn(),
	getTransaction: vi.fn(),
	getBlock: vi.fn(),
}))
vi.mock('#lib/server/anchoring', () => ({ findAnchoring }))
vi.mock('#wagmi.config.ts', () => ({ getWagmiConfig: () => ({}) }))
vi.mock('wagmi/actions', async (importOriginal) => ({
	...(await importOriginal<typeof import('wagmi/actions')>()),
	getChainId: () => 1,
	getTransaction,
	getBlock,
}))

describe('searchAnchoringResults', () => {
	it('lists registries by name, then records by checksum', async () => {
		findAnchoring.mockResolvedValue({
			registries: [{ id: 2199, name: 'relayed' }],
			records: [{ registryId: 1, recordId: 3, checksum: 'abc123' }],
		})
		expect(await searchAnchoringResults('relayed')).toEqual([
			{ type: 'anchoring', registryId: 2199, label: 'relayed' },
			{ type: 'anchoring', registryId: 1, recordId: 3, label: 'abc123' },
		])
		expect(findAnchoring).toHaveBeenCalledWith('relayed', 4)
	})

	it('answers nothing when the node cannot', async () => {
		findAnchoring.mockRejectedValue(new Error('node down'))
		expect(await searchAnchoringResults('relayed')).toEqual([])
	})

	it('finds a record whose checksum is hash-shaped', async () => {
		const hash = `0x${'ab'.repeat(32)}`
		// No transaction or block has it.
		getTransaction.mockRejectedValue(new Error('not found'))
		getBlock.mockRejectedValue(new Error('not found'))
		findAnchoring.mockResolvedValue({
			registries: [],
			records: [{ registryId: 1, recordId: 3, checksum: hash }],
		})
		const GET = Route.options.server?.handlers?.GET as (ctx: {
			request: Request
		}) => Promise<Response>
		const response = await GET({
			request: new Request(`http://explorer.test/api/search?q=${hash}`),
		})
		expect((await response.json()).results).toEqual([
			{ type: 'transaction', hash },
			{ type: 'anchoring', registryId: 1, recordId: 3, label: hash },
		])
	})
})
