import { describe, expect, it, vi } from 'vitest'
import { searchAnchoringResults } from '../src/routes/api/search.ts'

const { findAnchoring } = vi.hoisted(() => ({ findAnchoring: vi.fn() }))
vi.mock('#lib/server/anchoring', () => ({ findAnchoring }))

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
})
