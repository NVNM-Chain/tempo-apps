import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { fetchLogoURI, resolveLogoURI } from '#lib/domain/tip20'
import { getWagmiConfig } from '#wagmi.config.ts'

/**
 * A token's on-chain `logoURI`, as a redirect: following it is the browser's
 * business, so the Worker never fetches a URL the token's deployer chose.
 */
export const Route = createFileRoute('/api/token/logo/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!Address.validate(params.address))
					return new Response(null, { status: 400 })

				const logo = resolveLogoURI(
					await fetchLogoURI(getWagmiConfig(), params.address),
				)
				if (!logo || !/^https?:\/\//.test(logo))
					return new Response(null, { status: 404 })

				return new Response(null, {
					status: 302,
					headers: {
						Location: logo,
						'Cache-Control':
							'public, max-age=86400, stale-while-revalidate=604800',
					},
				})
			},
		},
	},
})
