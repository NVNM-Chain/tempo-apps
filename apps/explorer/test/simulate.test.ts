import { describe, expect, it, vi } from 'vitest'
import {
	MAX_SIMULATION_CALLDATA_BYTES,
	SimulationRequestSchema,
} from '#routes/api/simulate'

vi.mock('#wagmi.config', () => ({
	getTempoChain: () => ({ id: 787223 }),
}))

const validRequest = {
	chainId: 787223,
	from: '0x0000000000000000000000000000000000000001',
	to: '0x20c0000000000000000000000000000000000001',
	data: '0x06fdde03',
	value: '0',
	gas: '50000000',
	block: 'latest',
}

describe('simulation request validation', () => {
	it('accepts a valid call', () => {
		expect(SimulationRequestSchema.safeParse(validRequest).success).toBe(true)
	})

	it.each([
		787222, 7872, 42431,
	])('rejects a request for a different network (%i)', (chainId) => {
		expect(
			SimulationRequestSchema.safeParse({ ...validRequest, chainId }).success,
		).toBe(false)
	})

	it('rejects malformed addresses and numeric fields', () => {
		expect(
			SimulationRequestSchema.safeParse({
				...validRequest,
				to: '0x1234',
				gas: '-1',
			}).success,
		).toBe(false)
	})

	it('rejects oversized calldata', () => {
		const data = `0x${'00'.repeat(MAX_SIMULATION_CALLDATA_BYTES + 1)}`
		expect(
			SimulationRequestSchema.safeParse({ ...validRequest, data }).success,
		).toBe(false)
	})
})
