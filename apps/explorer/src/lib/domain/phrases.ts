import type { Address, Hex } from 'ox'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events'

/** One piece of a sentence: a fixed word, or an event argument shown as its kind. */
type Slot =
	| { word: string }
	| { account: string }
	| { value: string }
	| { hex: string }

type Phrase = {
	action: string
	parts: Slot[]
	notes?: [label: string, Slot][]
}

const to = (name: string): Slot[] => [{ word: 'to' }, { account: name }]
const from = (name: string): Slot[] => [{ word: 'from' }, { account: name }]
const inRegistry: [string, Slot] = ['Registry', { value: 'registryId' }]

/** The Safe and anchoring events, as sentences, by event name. */
const phrases: Record<string, Phrase> = {
	// Safe v1.3.0 and its proxy factory
	ProxyCreation: {
		action: 'Deploy Multisig',
		parts: [{ account: 'proxy' }],
	},
	SafeSetup: {
		action: 'Set Up Multisig',
		parts: [{ word: 'with threshold' }, { value: 'threshold' }],
	},
	SafeMultiSigTransaction: {
		action: 'Multisig Call',
		parts: to('to'),
	},
	SafeModuleTransaction: {
		action: 'Module Call',
		parts: to('to'),
	},
	ExecutionSuccess: {
		action: 'Execute Multisig Transaction',
		parts: [{ hex: 'txHash' }],
	},
	ExecutionFailure: {
		action: 'Multisig Transaction Failed',
		parts: [{ hex: 'txHash' }],
	},
	ExecutionFromModuleSuccess: {
		action: 'Execute Module Transaction',
		parts: from('module'),
	},
	ExecutionFromModuleFailure: {
		action: 'Module Transaction Failed',
		parts: from('module'),
	},
	ApproveHash: {
		action: 'Approve Hash',
		parts: [{ hex: 'approvedHash' }, { word: 'by' }, { account: 'owner' }],
	},
	SignMsg: {
		action: 'Sign Message',
		parts: [{ hex: 'msgHash' }],
	},
	AddedOwner: {
		action: 'Add Owner',
		parts: [{ account: 'owner' }],
	},
	RemovedOwner: {
		action: 'Remove Owner',
		parts: [{ account: 'owner' }],
	},
	ChangedThreshold: {
		action: 'Change Threshold',
		parts: [{ word: 'to' }, { value: 'threshold' }],
	},
	EnabledModule: {
		action: 'Enable Module',
		parts: [{ account: 'module' }],
	},
	DisabledModule: {
		action: 'Disable Module',
		parts: [{ account: 'module' }],
	},
	ChangedFallbackHandler: {
		action: 'Change Fallback Handler',
		parts: to('handler'),
	},
	ChangedGuard: {
		action: 'Change Guard',
		parts: to('guard'),
	},
	SafeReceived: {
		action: 'Receive',
		parts: from('sender'),
	},
	// Anchoring (0x…0a00), and the ownership and upgrades of its proxy
	AddRegistry: {
		action: 'Add Registry',
		parts: [{ value: 'name' }],
		notes: [inRegistry],
	},
	AddRecord: {
		action: 'Add Record',
		parts: [
			{ word: 'version' },
			{ value: 'index' },
			{ word: 'of' },
			{ value: 'checksum' },
		],
		notes: [inRegistry, ['Record', { value: 'recordId' }]],
	},
	UpdateRecordStatus: {
		action: 'Update Record Status',
		parts: [{ value: 'status' }, { word: 'on version' }, { value: 'index' }],
		notes: [inRegistry, ['Record', { value: 'recordId' }]],
	},
	GrantRole: {
		action: 'Grant Role',
		parts: [{ value: 'role' }, ...to('account')],
		notes: [inRegistry, ['Record', { value: 'checksum' }]],
	},
	RevokeRole: {
		action: 'Revoke Role',
		parts: [{ value: 'role' }, ...from('account')],
		notes: [inRegistry, ['Record', { value: 'checksum' }]],
	},
	OwnershipTransferred: {
		action: 'Transfer Ownership',
		parts: to('newOwner'),
	},
	Upgraded: {
		action: 'Upgrade',
		parts: to('implementation'),
	},
}

function part(
	slot: Slot,
	args: Record<string, unknown>,
): KnownEventPart | undefined {
	if ('word' in slot) return { type: 'text', value: slot.word }
	if ('account' in slot) {
		const value = args[slot.account]
		return typeof value === 'string'
			? { type: 'account', value: value as Address.Address }
			: undefined
	}
	if ('hex' in slot) {
		const value = args[slot.hex]
		return typeof value === 'string'
			? { type: 'hex', value: value as Hex.Hex }
			: undefined
	}
	const value = args[slot.value]
	if (typeof value === 'bigint' || typeof value === 'number')
		return { type: 'number', value }
	return value === undefined
		? undefined
		: { type: 'text', value: String(value) }
}

/** Whether `event` is one of these sentences, which the Tempo API reports as unknown. */
export function isPhrasedEvent(event: KnownEvent): boolean {
	return Object.hasOwn(phrases, event.type)
}

/** A Safe or anchoring event as a sentence, or `null` for any other event. */
export function describePhrasedEvent(event: {
	eventName: string
	args: unknown
}): KnownEvent | null {
	const phrase = phrases[event.eventName]
	if (!phrase) return null
	const args = (event.args ?? {}) as Record<string, unknown>
	const parts = phrase.parts
		.map((slot) => part(slot, args))
		.filter((p): p is KnownEventPart => p !== undefined)
	const notes = (phrase.notes ?? []).flatMap(([label, slot]) => {
		const value = part(slot, args)
		return value ? [[label, value] as [string, KnownEventPart]] : []
	})
	return {
		type: event.eventName,
		parts: [{ type: 'action', value: phrase.action }, ...parts],
		...(notes.length ? { note: notes } : {}),
	}
}
