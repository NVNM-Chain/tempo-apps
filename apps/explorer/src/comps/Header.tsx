import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
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
import ChevronDownIcon from '~icons/lucide/chevron-down'
import SquareSquare from '~icons/lucide/square-square'
import FlaskConicalIcon from '~icons/lucide/flask-conical'

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
					<Link
						to="/simulate"
						className="flex h-[28px] items-center gap-[5px] rounded-[8px] border border-base-border bg-base-plane px-[8px] text-[12px] text-secondary hover:border-accent hover:text-primary press-down"
					>
						<FlaskConicalIcon className="size-[12px]" />
						<span className="@max-[799px]:hidden">Simulate</span>
					</Link>
					<Header.BlockNumber />
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
		const [isOpen, setIsOpen] = React.useState(false)
		const menuId = React.useId()
		const rootRef = React.useRef<HTMLDivElement>(null)
		const activeOption = getActiveExplorerNetworkOption(tempoEnv)
		const isNotFoundPage = useIsNotFoundPage()
		const currentPath = useRouterState({
			select: (state) => {
				const location = state.resolvedLocation ?? state.location
				const hash = location.hash ? `#${location.hash.replace(/^#/, '')}` : ''
				return `${location.pathname}${location.searchStr}${hash}`
			},
		})

		React.useEffect(() => {
			if (!isOpen) return

			function handlePointerDown(event: PointerEvent) {
				if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
			}

			function handleKeyDown(event: KeyboardEvent) {
				if (event.key === 'Escape') setIsOpen(false)
			}

			window.addEventListener('pointerdown', handlePointerDown)
			window.addEventListener('keydown', handleKeyDown)

			return () => {
				window.removeEventListener('pointerdown', handlePointerDown)
				window.removeEventListener('keydown', handleKeyDown)
			}
		}, [isOpen])

		return (
			<div ref={rootRef} className="relative">
				<button
					type="button"
					aria-controls={isOpen ? menuId : undefined}
					aria-expanded={isOpen}
					aria-haspopup="menu"
					className="flex h-[28px] shrink-0 items-center justify-center gap-[5px] rounded-[8px] border border-base-border bg-base-plane px-[8px] py-[4px] text-[14px] font-medium leading-[140%] text-secondary transition-colors hover:border-accent hover:text-primary focus-visible:outline-none press-down"
					title={`Network: ${activeOption.label}`}
					onClick={() => setIsOpen((value) => !value)}
				>
					<Header.NetworkStatusDot className={activeOption.dotClassName} />
					<span>{activeOption.label}</span>
					<ChevronDownIcon
						className={cx(
							'size-[12px] text-tertiary transition-transform duration-100',
							isOpen && 'rotate-180',
						)}
					/>
				</button>
				{isOpen && (
					<div
						id={menuId}
						role="menu"
						aria-label="NVNM networks"
						className="absolute left-0 top-[calc(100%+8px)] z-50 w-[156px] overflow-hidden rounded-[10px] border border-base-border bg-base-background/95 p-[4px] shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur"
					>
						{EXPLORER_NETWORK_OPTIONS.map((option) => {
							const isActive = option.env === activeOption.env

							return (
								<a
									key={option.env}
									href={buildExplorerNetworkHref(option.host, currentPath, {
										fallbackToHome:
											isNotFoundPage &&
											!isExplorerNetworkPathPreservable(currentPath),
									})}
									role="menuitemradio"
									aria-checked={isActive}
									aria-current={isActive ? 'page' : undefined}
									className={cx(
										'flex items-center gap-[8px] rounded-[7px] px-[10px] py-[9px] text-[14px] font-medium leading-[140%] text-secondary transition-colors hover:bg-surface hover:text-primary focus-visible:outline-none',
										isActive && 'bg-surface text-primary',
									)}
									onClick={() => setIsOpen(false)}
								>
									<Header.NetworkStatusDot className={option.dotClassName} />
									<span>{option.label}</span>
								</a>
							)
						})}
					</div>
				)}
			</div>
		)
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
			<Link
				disabled={!isTestnet()}
				to="/block/$id"
				params={{ id: blockNumber != null ? String(blockNumber) : 'latest' }}
				className={cx(
					className,
					'flex items-center gap-[6px] text-[15px] font-medium text-secondary press-down origin-right transition-[opacity,scale] duration-[80ms]',
					isReady ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
				)}
				title="View latest block"
			>
				<SquareSquare className="size-[18px] text-accent" />
				<div className="text-nowrap">
					<span className="text-primary font-medium tabular-nums font-mono min-w-[6ch] inline-block">
						{blockNumber != null ? String(blockNumber) : '…'}
					</span>
				</div>
			</Link>
		)
	}

	export namespace BlockNumber {
		export interface Props {
			initial?: bigint
			className?: string | undefined
		}
	}

	export function NetworkStatusDot(
		props: NetworkStatusDot.Props,
	): React.JSX.Element {
		const { className } = props
		return (
			<span aria-hidden className="relative flex size-[6px] shrink-0">
				<span
					className={cx(
						'absolute inline-flex size-full animate-ping rounded-full opacity-60',
						className,
					)}
				/>
				<span
					className={cx(
						'relative inline-flex size-[6px] rounded-full',
						className,
					)}
				/>
			</span>
		)
	}

	export namespace NetworkStatusDot {
		export interface Props {
			className: string
		}
	}
}
