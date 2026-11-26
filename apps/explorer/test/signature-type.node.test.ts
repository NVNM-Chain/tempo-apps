import { describe, expect, it } from 'vitest'
import { signatureTypeLabel } from '#lib/domain/signature-type'

const secp256k1 = { type: 'secp256k1', signature: { r: 1n, s: 2n, yParity: 0 } }

describe('signatureTypeLabel', () => {
	it('names the scheme', () => {
		expect(signatureTypeLabel(secp256k1 as never)).toBe('Secp256k1')
		expect(signatureTypeLabel({ type: 'webAuthn' } as never)).toBe('WebAuthn')
		expect(signatureTypeLabel(undefined)).toBeUndefined()
	})

	it('names the scheme an access key signed with', () => {
		expect(
			signatureTypeLabel({
				type: 'keychain',
				inner: { type: 'p256' },
			} as never),
		).toBe('Keychain (P256)')
	})
})
