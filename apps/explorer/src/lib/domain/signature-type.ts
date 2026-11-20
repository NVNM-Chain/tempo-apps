import type { SignatureEnvelope } from 'ox/tempo'

const names = {
	keychain: 'Keychain',
	multisig: 'Multisig',
	p256: 'P256',
	secp256k1: 'Secp256k1',
	webAuthn: 'WebAuthn',
} as const

/** How a Tempo transaction was signed; an access key also names the scheme it signed with. */
export function signatureTypeLabel(
	signature: SignatureEnvelope.SignatureEnvelope | undefined,
): string | undefined {
	if (!signature) return undefined
	if (signature.type === 'keychain')
		return `${names.keychain} (${names[signature.inner.type]})`
	return names[signature.type]
}
