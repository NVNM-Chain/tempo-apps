import {
	encodeAbiParameters,
	encodeEventTopics,
	getAbiItem,
	type AbiEvent,
	type Log,
} from 'viem'
import { describe, expect, it } from 'vitest'
import { anchoringAbi, safeEventsAbi } from '#lib/abis'
import { parseKnownEvent } from '#lib/domain/known-events'
import { selectTransactionDescriptionEvents } from '#lib/domain/transaction-activities'

const SAFE = '0x2222222222222222222222222222222222222222'
const ANCHORING = '0x0000000000000000000000000000000000000a00'
const CALLER = '0x1111111111111111111111111111111111111111'

/** A log the emitter would write for `name` with `args`. */
function log(
	abi: readonly unknown[],
	name: string,
	args: Record<string, unknown>,
	address: string,
): Log {
	const event = getAbiItem({ abi: abi as AbiEvent[], name }) as AbiEvent
	const data = event.inputs.filter((input) => !input.indexed)
	return {
		address,
		topics: encodeEventTopics({ abi: [event], args } as never),
		data: encodeAbiParameters(
			data,
			data.map((input) => args[input.name as string]),
		),
		blockHash: null,
		blockNumber: null,
		logIndex: 0,
		transactionHash: null,
		transactionIndex: 0,
		removed: false,
	} as unknown as Log
}

describe('Safe and anchoring events', () => {
	it('reads a Safe v1.3.0 execution, whose hash is in the data', () => {
		const txHash = `0x${'ab'.repeat(32)}`
		expect(
			parseKnownEvent(
				log(safeEventsAbi, 'ExecutionSuccess', { txHash, payment: 0n }, SAFE),
			),
		).toEqual({
			type: 'ExecutionSuccess',
			parts: [
				{ type: 'action', value: 'Execute Multisig Transaction' },
				{ type: 'hex', value: txHash },
			],
		})
	})

	it('reads an anchored record with its registry and record', () => {
		expect(
			parseKnownEvent(
				log(
					anchoringAbi,
					'AddRecord',
					{
						caller: CALLER,
						registryId: 7n,
						recordId: 3n,
						index: 2n,
						checksum: 'abc123',
					},
					ANCHORING,
				),
			),
		).toEqual({
			type: 'AddRecord',
			parts: [
				{ type: 'action', value: 'Add Record' },
				{ type: 'text', value: 'version' },
				{ type: 'number', value: 2n },
				{ type: 'text', value: 'of' },
				{ type: 'text', value: 'abc123' },
			],
			note: [
				['Registry', { type: 'number', value: 7n }],
				['Record', { type: 'number', value: 3n }],
			],
		})
	})

	it('describes them beside the API’s activities, which call them unknown', () => {
		const fee = {
			type: 'fee',
			parts: [{ type: 'action' as const, value: 'Pay Fee' }],
		}
		const registry = {
			type: 'AddRegistry',
			parts: [{ type: 'action' as const, value: 'Add Registry' }],
		}
		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [fee],
				fallbackEvents: [registry, fee],
			}),
		).toEqual([registry, fee])
	})
})
