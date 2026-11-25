import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import { z } from 'zod/mini'

export const zAddress = (opts?: { lowercase?: boolean }) =>
	z.pipe(
		z.string().check((ctx) => {
			if (!Address.validate(ctx.value))
				ctx.issues.push({
					code: 'custom',
					input: ctx.value,
					message: 'Invalid address',
				})
		}),
		z.transform((x) => {
			if (opts?.lowercase) x = x.toLowerCase()
			return Address.from(x)
		}),
	)

/** A whole number from 1, as pages and ids count. */
export const zPositiveInt = () => z.int().check(z.gte(1))

/** A `page` search param; anything but a whole number from 1 reads as page 1. */
export const zPage = () =>
	// `prefault` keeps the param optional in links to the route.
	z.prefault(z.catch(z.pipe(z.coerce.number(), zPositiveInt()), 1), 1)

export const zHash = () =>
	z.pipe(
		z.string().check((ctx) => {
			if (!Hex.validate(ctx.value) || Hex.size(ctx.value) !== 32)
				ctx.issues.push({
					code: 'custom',
					input: ctx.value,
					message: 'Invalid 32-byte hash',
				})
		}),
		z.transform((x) => x as Hex.Hex),
	)
