import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import * as React from 'react'
import * as z from 'zod/mini'
import { ExploreInput } from '#comps/ExploreInput'
import { cx } from '#lib/css'
import { getTempoEnv } from '#lib/env'
import BoxIcon from '~icons/lucide/box'
import CoinsIcon from '~icons/lucide/coins'
import FileIcon from '~icons/lucide/file'
import ReceiptIcon from '~icons/lucide/receipt'
import UserIcon from '~icons/lucide/user'

const SPOTLIGHT_DATA: Record<
	string,
	{
		accountAddress: Address.Address
		contractAddress: Address.Address
		receiptHash: Hex.Hex
	}
> = {
	// Real values from tidx_787222.txs. Re-pick if the chain is regenerated.
	nvnm: {
		accountAddress: '0x9493feed391b9d1875731c8a4b5e492db8505843',
		contractAddress: '0x20c000000000000000000000566f8b4a921dcd3a',
		receiptHash:
			'0x4dc23799c4f7474c29de45e62ec533c6cd3026f3ac0c5993483487d3b2fc7f72',
	},
}

function getSpotlightData() {
	return SPOTLIGHT_DATA[getTempoEnv()]
}

export const Route = createFileRoute('/_layout/')({
	component: Component,
	validateSearch: z.object({
		q: z.optional(z.coerce.string()),
	}).parse,
})

function Component() {
	const navigate = useNavigate()
	const { q } = Route.useSearch()
	const query = q?.trim() ?? ''
	const [inputValue, setInputValue] = React.useState(query)

	React.useEffect(() => {
		setInputValue(query)
	}, [query])

	return (
		<div className="flex flex-1 w-full flex-col text-[16px]">
			<div className="flex min-h-[42svh] flex-col justify-end">
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
						className="bg-base-alt"
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
									to: '/receipt/$hash',
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
				<SpotlightLinks />
			</div>
		</div>
	)
}

function SpotlightLinks() {
	const spotlightData = getSpotlightData()

	return (
		<section className="text-center max-w-[500px] px-4">
			<div className="group/pills flex items-center gap-2 text-[13px] flex-wrap justify-center">
				{spotlightData && (
					<>
						<SpotlightPill
							to="/address/$address"
							params={{ address: spotlightData.accountAddress }}
							icon={<UserIcon className="size-[14px] text-accent" />}
						>
							Account
						</SpotlightPill>
						<SpotlightPill
							to="/address/$address"
							params={{
								address: spotlightData.contractAddress,
							}}
							search={{ tab: 'contract' }}
							icon={<FileIcon className="size-[14px] text-accent" />}
						>
							Contract
						</SpotlightPill>
						<SpotlightPill
							to="/receipt/$hash"
							params={{ hash: spotlightData.receiptHash }}
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
				'flex items-center gap-1.5 text-base-content-secondary hover:text-base-content border hover:border-accent focus-visible:border-accent px-2.5 py-1 rounded-full! press-down bg-surface focus-visible:outline-none border-base-border',
				className,
			)}
		>
			{icon}
			<span>{children}</span>
		</Link>
	)
}

function LandingWords() {
	return (
		<div className="flex flex-col items-center gap-1">
			<span className="text-[32px] font-semibold tracking-[-0.02em] leading-[0.95] text-primary/50">
				Search
			</span>
			<span className="text-[40px] font-semibold tracking-[-0.02em] leading-[0.95] text-primary/70">
				Explore
			</span>
			<span className="text-[52px] font-semibold tracking-[-0.02em] leading-[0.95] text-primary">
				Discover
			</span>
		</div>
	)
}
