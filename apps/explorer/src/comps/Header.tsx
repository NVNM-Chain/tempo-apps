import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { Badge, Button, Menu, StatusIndicator } from '@tempoxyz/ds'
import { ChevronDown, Layers, Play } from '@tempoxyz/ds/icons'
import * as React from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { useAnimatedBlockNumber, useLiveBlockNumber } from '#lib/block-number'
import { cx } from '#lib/css'
import { type TempoEnv, getTempoEnv, isTestnet } from '#lib/env'
import {
	buildExplorerNetworkHref,
	EXPLORER_NETWORK_OPTIONS,
	getActiveExplorerNetworkOption,
	isExplorerNetworkPathPreservable,
} from '#lib/explorer-network'
import { useIsNotFoundPage } from '#lib/not-found'

export function Header(): React.JSX.Element {
	const tempoEnv = getTempoEnv()

	return (
		<header className="@container relative z-1">
			<div className="px-[24px] @min-[1240px]:pt-[48px] @min-[1240px]:px-[84px] flex items-center justify-between min-h-16 @min-[800px]:@max-[1239px]:h-[88px] pt-[36px] select-none relative z-20 print:justify-center">
				<div className="flex items-center gap-[12px] relative z-1 h-[28px]">
					<Link
						to="/"
						className="flex items-center gap-[12px] press-down py-[4px]"
					>
						<img src="/logo.svg" alt="" className="size-[28px]" />
						<span className="text-[18px] font-semibold text-primary">
							nvnmchain
						</span>
					</Link>
					<Header.NetworkBadge tempoEnv={tempoEnv} />
				</div>
				<Header.Search />
				<div className="relative z-1 print:hidden flex items-center gap-[8px]">
					<span className="@max-[799px]:hidden flex">
						<Button.Link
							render={<Link to="/simulate" />}
							variant="secondary"
							size="small"
						>
							<Play />
							Simulate
						</Button.Link>
					</span>
					<span className="@min-[800px]:hidden flex">
						<Button.Link
							render={<Link to="/simulate" />}
							aria-label="Simulate transaction"
							variant="secondary"
							size="small"
							shape="icon"
						>
							<Play />
						</Button.Link>
					</span>
					<span className="@max-[399px]:hidden flex">
						<Header.BlockNumber />
					</span>
				</div>
			</div>
			<Header.Search compact />
		</header>
	)
}

export namespace Header {
	export function Search(props: { compact?: boolean }) {
		const { compact = false } = props
		const router = useRouter()
		const navigate = useNavigate()
		const [inputValue, setInputValue] = React.useState('')
		const resolvedPathname = useRouterState({
			select: (state) =>
				state.resolvedLocation?.pathname ?? state.location.pathname,
		})
		const showSearch = resolvedPathname !== '/'

		React.useEffect(() => {
			return router.subscribe('onResolved', ({ hrefChanged }) => {
				if (hrefChanged) setInputValue('')
			})
		}, [router])

		if (!showSearch) return null

		const exploreInput = (
			<ExploreInput
				value={inputValue}
				onChange={setInputValue}
				onActivate={({ value, type }) => {
					if (type === 'block') {
						navigate({ to: '/block/$id', params: { id: value } })
						return
					}
					if (type === 'hash') {
						navigate({ to: '/tx/$hash', params: { hash: value } })
						return
					}
					if (type === 'token') {
						navigate({ to: '/token/$address', params: { address: value } })
						return
					}
					if (type === 'address') {
						navigate({
							to: '/address/$address',
							params: { address: value },
						})
						return
					}
				}}
			/>
		)

		if (compact)
			return (
				<div className="@min-[800px]:hidden sticky top-0 z-10 px-4 pt-[16px] pb-[12px] print:hidden">
					<ExploreInput
						wide
						value={inputValue}
						onChange={setInputValue}
						onActivate={({ value, type }) => {
							if (type === 'block') {
								navigate({ to: '/block/$id', params: { id: value } })
								return
							}
							if (type === 'hash') {
								navigate({ to: '/tx/$hash', params: { hash: value } })
								return
							}
							if (type === 'token') {
								navigate({ to: '/token/$address', params: { address: value } })
								return
							}
							if (type === 'address') {
								navigate({
									to: '/address/$address',
									params: { address: value },
								})
								return
							}
						}}
					/>
				</div>
			)

		return (
			<>
				<div className="absolute left-0 right-0 justify-center flex z-1 h-0 items-center @max-[1239px]:hidden print:hidden">
					{exploreInput}
				</div>
				<div className="flex-1 flex justify-center px-[24px] @max-[799px]:hidden @min-[1240px]:hidden print:hidden">
					<ExploreInput
						wide
						value={inputValue}
						onChange={setInputValue}
						onActivate={({ value, type }) => {
							if (type === 'block') {
								navigate({ to: '/block/$id', params: { id: value } })
								return
							}
							if (type === 'hash') {
								navigate({ to: '/tx/$hash', params: { hash: value } })
								return
							}
							if (type === 'token') {
								navigate({ to: '/token/$address', params: { address: value } })
								return
							}
							if (type === 'address') {
								navigate({
									to: '/address/$address',
									params: { address: value },
								})
								return
							}
						}}
					/>
				</div>
			</>
		)
	}

	export function NetworkBadge(props: NetworkBadge.Props): React.JSX.Element {
		const { tempoEnv } = props
		const activeOption = getActiveExplorerNetworkOption(tempoEnv)
		const isNotFoundPage = useIsNotFoundPage()
		const currentPath = useRouterState({
			select: (state) => {
				const location = state.resolvedLocation ?? state.location
				const hash = location.hash ? `#${location.hash.replace(/^#/, '')}` : ''
				return `${location.pathname}${location.searchStr}${hash}`
			},
		})

		return (
			<Menu.Root>
				<Menu.Trigger
					render={<Button variant="secondary" size="small" />}
					title={`Network: ${activeOption.label}`}
				>
					<StatusIndicator intent={networkIntent(activeOption.dotClassName)}>
						<span className="text-primary">{activeOption.label}</span>
					</StatusIndicator>
					<ChevronDown />
				</Menu.Trigger>
				<Menu.Popup align="start" sideOffset={8} aria-label="NVNM networks">
					{EXPLORER_NETWORK_OPTIONS.map((option) => {
						const isActive = option.env === activeOption.env
						return (
							<Menu.LinkItem
								key={option.env}
								href={buildExplorerNetworkHref(option.host, currentPath, {
									fallbackToHome:
										isNotFoundPage &&
										!isExplorerNetworkPathPreservable(currentPath),
								})}
								aria-current={isActive ? 'page' : undefined}
							>
								<StatusIndicator intent={networkIntent(option.dotClassName)}>
									<span className={cx(isActive && 'text-primary')}>
										{option.label}
									</span>
								</StatusIndicator>
							</Menu.LinkItem>
						)
					})}
				</Menu.Popup>
			</Menu.Root>
		)
	}

	function networkIntent(dotClassName: string): 'positive' | 'warning' {
		return dotClassName === 'bg-positive' ? 'positive' : 'warning'
	}

	export namespace NetworkBadge {
		export interface Props {
			tempoEnv: TempoEnv
		}
	}

	export function BlockNumber(props: BlockNumber.Props) {
		const { initial, className } = props
		const resolvedPathname = useRouterState({
			select: (state) =>
				state.resolvedLocation?.pathname ?? state.location.pathname,
		})
		const optimisticBlockNumber = useAnimatedBlockNumber(initial)
		const liveBlockNumber = useLiveBlockNumber(initial)
		const blockNumber =
			resolvedPathname === '/blocks' ? liveBlockNumber : optimisticBlockNumber
		const isReady = blockNumber != null

		return (
			<Badge
				variant="outlined"
				size="small"
				render={
					<Link
						disabled={!isTestnet()}
						to="/block/$id"
						params={{
							id: blockNumber != null ? String(blockNumber) : 'latest',
						}}
						title="View latest block"
					/>
				}
				className={cx(
					className,
					'origin-right transition-[opacity,scale] duration-[80ms]',
					isReady ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
				)}
			>
				<Layers />
				<span className="tabular-nums min-w-[6ch] text-primary">
					{blockNumber != null ? String(blockNumber) : '…'}
				</span>
			</Badge>
		)
	}

	export namespace BlockNumber {
		export interface Props {
			initial?: bigint
			className?: string | undefined
		}
	}
}
