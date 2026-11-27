import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import * as z from 'zod/mini'
import { ExploreInput } from '#comps/ExploreInput'
import { HomeDashboard } from '#comps/HomeDashboard'
import { cx } from '#lib/css'
import { homeStatsQueryOptions } from '#lib/queries'
import type { ListedTransaction } from '#lib/server/transaction-list'
import AnchorIcon from '~icons/lucide/anchor'
import BoxIcon from '~icons/lucide/box'
import CoinsIcon from '~icons/lucide/coins'
import FileIcon from '~icons/lucide/file'
import ReceiptIcon from '~icons/lucide/receipt'
import UserIcon from '~icons/lucide/user'

export const Route = createFileRoute('/_layout/')({
	component: Component,
	validateSearch: z.object({
		q: z.optional(z.coerce.string()),
	}),
	// Without an indexer the page is the search box alone.
	loader: ({ context }) =>
		context.queryClient.prefetchQuery(homeStatsQueryOptions()),
})

function Component() {
	const navigate = useNavigate()
	const { q } = Route.useSearch()
	const query = q?.trim() ?? ''
	const [inputValue, setInputValue] = React.useState(query)
	const { data: stats } = useQuery(homeStatsQueryOptions())

	React.useEffect(() => {
		setInputValue(query)
	}, [query])

	return (
		<div className="flex flex-1 w-full flex-col copy-16">
			<div
				className={cx(
					'flex flex-col justify-end',
					stats ? 'min-h-[18svh]' : 'min-h-[42svh]',
				)}
			>
				<div className="flex justify-center select-none [@media(max-height:360px)]:hidden">
					<LandingWords />
				</div>
			</div>
			<div className="flex grow flex-col items-center px-4 pt-8 gap-8">
				<div className="w-full max-w-[560px] relative z-20">
					<ExploreInput
						autoFocus
						size="large"
						wide
						className="bg-pane"
						value={inputValue}
						onChange={setInputValue}
						onActivate={(data) => {
							if (data.type === 'block') {
								navigate({
									to: '/block/$id',
									params: { id: data.value },
								})
								return
							}
							if (data.type === 'hash') {
								navigate({
									to: '/tx/$hash',
									params: { hash: data.value },
								})
								return
							}
							if (data.type === 'token') {
								navigate({
									to: '/token/$address',
									params: { address: data.value },
								})
								return
							}
							if (data.type === 'address') {
								navigate({
									to: '/address/$address',
									params: { address: data.value },
								})
								return
							}
						}}
					/>
				</div>
				<SpotlightLinks example={stats?.example} />
				{stats && <HomeDashboard stats={stats} />}
			</div>
		</div>
	)
}

function SpotlightLinks(props: { example?: ListedTransaction }) {
	const tx = props.example

	return (
		<section className="text-center max-w-[500px] px-4">
			<div className="group/pills flex items-center gap-2 copy-13 flex-wrap justify-center">
				{tx?.to && (
					<>
						<SpotlightPill
							to="/address/$address"
							params={{ address: tx.from }}
							icon={<UserIcon className="size-[14px] text-accent" />}
						>
							Account
						</SpotlightPill>
						<SpotlightPill
							to="/address/$address"
							params={{ address: tx.to }}
							search={{ tab: 'contract' }}
							icon={<FileIcon className="size-[14px] text-accent" />}
						>
							Contract
						</SpotlightPill>
						<SpotlightPill
							to="/receipt/$hash"
							params={{ hash: tx.hash }}
							icon={<ReceiptIcon className="size-[14px] text-accent" />}
						>
							Receipt
						</SpotlightPill>
					</>
				)}
				<SpotlightPill
					to="/blocks"
					icon={<BoxIcon className="size-[14px] text-accent" />}
				>
					Blocks
				</SpotlightPill>
				<SpotlightPill
					to="/tokens"
					icon={<CoinsIcon className="size-[14px] text-accent" />}
				>
					Tokens
				</SpotlightPill>
				<SpotlightPill
					to="/anchoring"
					icon={<AnchorIcon className="size-[14px] text-accent" />}
				>
					Anchoring
				</SpotlightPill>
			</div>
		</section>
	)
}

function SpotlightPill(props: {
	className?: string
	to: string
	params?: Record<string, string>
	search?: Record<string, string>
	icon: React.ReactNode
	children: React.ReactNode
}) {
	const { className, to, params, search, icon, children } = props
	return (
		<Link
			to={to}
			{...(params ? { params } : {})}
			{...(search ? { search } : {})}
			className={cx(
				'flex h-9 items-center gap-2 text-secondary hover:text-primary border hover:border-border-hover px-3 rounded-button press-down bg-surface border-base-border transition-colors',
				className,
			)}
		>
			{icon}
			<span>{children}</span>
		</Link>
	)
}

function LandingWords(): React.JSX.Element {
	return (
		<h1 className="flex flex-col items-center gap-1">
			<span className="heading-32 text-primary/50">Search</span>
			<span className="heading-40 text-primary/70">Explore</span>
			<span className="heading-48 text-primary">Discover</span>
		</h1>
	)
}
