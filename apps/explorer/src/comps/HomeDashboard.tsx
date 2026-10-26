import { Link } from '@tanstack/react-router'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { TransactionsGrid } from '#comps/TransactionsGrid'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#comps/TimeFormat'
import type { HomeStats } from '#lib/server/home'

/** The chain at a glance: index progress, the hour's rates, the latest blocks and transactions. */
export function HomeDashboard(props: { stats: HomeStats }) {
	const { stats } = props
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	const time = {
		align: 'end' as const,
		label: (
			<TimeColumnHeader
				label="Time"
				formatLabel={formatLabel}
				onCycle={cycleTimeFormat}
			/>
		),
		width: '1fr' as const,
		minWidth: 80,
	}
	const timestamp = (at: number) => (
		<span className="font-sans text-secondary tabular-nums whitespace-nowrap">
			<FormattedTimestamp timestamp={BigInt(at)} format={timeFormat} />
		</span>
	)
	const blockColumns: DataGrid.Column[] = [
		{ label: 'Block', width: '1fr', minWidth: 100 },
		time,
		{ align: 'end', label: 'Txns', width: '1fr' },
		{ align: 'end', label: 'Gas', width: '1fr' },
	]

	return (
		<div className="flex flex-col gap-6 w-full max-w-300 mx-auto pb-16">
			<IndexProgress indexed={stats.indexed} head={stats.head} />
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
				<Tile label="Latest Block">
					<Link
						to="/block/$id"
						params={{ id: String(stats.latestBlock) }}
						className="text-accent press-down"
					>
						{stats.latestBlock.toLocaleString()}
					</Link>
				</Tile>
				<Tile label="Block Time">
					{stats.blockTimeMs === null
						? '—'
						: `${(stats.blockTimeMs / 1000).toFixed(2)}s`}
				</Tile>
				<Tile label="TPS (last hour)">
					{stats.tps === null ? '—' : stats.tps.toFixed(2)}
				</Tile>
				<Tile label="Gas Utilization">
					{stats.gasUtilization === null
						? '—'
						: `${stats.gasUtilization.toFixed(2)}%`}
				</Tile>
				<Tile label="Total Txns">{stats.totalTxns.toLocaleString()}</Tile>
				<Tile label="Tokens">{stats.tokens.toLocaleString()}</Tile>
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
				<Sparkline title="Transactions per minute" values={stats.txPerMinute} />
				<Sparkline title="Gas per minute" values={stats.gasPerMinute} />
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
				<Sections
					mode="tabs"
					activeSection={0}
					sections={[
						{
							title: 'Latest Blocks',
							autoCollapse: false,
							content: (
								<DataGrid
									columns={{ stacked: blockColumns, tabs: blockColumns }}
									items={() =>
										stats.blocks.map((block) => ({
											key: `block-${block.number}`,
											cells: [
												<span
													key="number"
													className="font-sans tabular-nums text-accent font-medium"
												>
													#{block.number}
												</span>,
												timestamp(block.timestamp),
												<span
													key="txns"
													className="font-sans text-secondary tabular-nums"
												>
													{block.txns}
												</span>,
												<span
													key="gas"
													className="font-sans text-secondary tabular-nums"
												>
													{block.gasLimit > 0
														? `${((block.gasUsed * 100) / block.gasLimit).toFixed(2)}%`
														: '—'}
												</span>,
											],
											link: {
												href: `/block/${block.number}`,
												title: `View block #${block.number}`,
											},
										}))
									}
									totalItems={stats.blocks.length}
									page={1}
									itemsLabel="blocks"
									emptyState="No blocks indexed yet."
									pagination={<ViewAll to="/blocks" label="View all blocks" />}
								/>
							),
						},
					]}
				/>
				<Sections
					mode="tabs"
					activeSection={0}
					sections={[
						{
							title: 'Latest Transactions',
							autoCollapse: false,
							content: (
								<TransactionsGrid
									transactions={stats.transactions}
									totalItems={stats.transactions.length}
									page={1}
									pagination={
										<ViewAll to="/txs" label="View all transactions" />
									}
								/>
							),
						},
					]}
				/>
			</div>
		</div>
	)
}

function IndexProgress(props: { indexed: number; head: number }) {
	// tidx never indexes block 0, so `head` blocks is everything.
	const { indexed, head } = props
	const pct = head > 0 ? Math.min((indexed / head) * 100, 100) : 0
	return (
		<div className="flex flex-col gap-[6px]">
			<div className="flex items-center justify-between text-[12px] text-tertiary">
				<span>
					Index progress — {indexed.toLocaleString()} / {head.toLocaleString()}{' '}
					blocks indexed
				</span>
				<span className="text-accent tabular-nums">{pct.toFixed(1)}%</span>
			</div>
			<div className="h-[4px] w-full overflow-hidden rounded-full bg-base-alt">
				<div className="h-full bg-accent" style={{ width: `${pct}%` }} />
			</div>
		</div>
	)
}

function Tile(props: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-[4px] rounded-[10px] border border-base-border bg-surface px-[16px] py-[14px]">
			<span className="font-sans text-[20px] font-medium tabular-nums text-primary">
				{props.children}
			</span>
			<span className="text-[12px] text-tertiary">{props.label}</span>
		</div>
	)
}

function Sparkline(props: { title: string; values: number[] }) {
	const { title, values } = props
	const max = Math.max(...values, 1)
	const points = values
		.map((value, i) => `${i},${(30 - (value / max) * 28).toFixed(2)}`)
		.join(' ')
	return (
		<div className="flex flex-col gap-[8px] rounded-[10px] border border-base-border bg-surface px-[16px] py-[14px]">
			<div className="flex items-center justify-between text-[12px] text-tertiary">
				<span>
					{title} <span className="text-tertiary/70">(last hour)</span>
				</span>
				<span className="tabular-nums">
					peak {Math.max(...values, 0).toLocaleString()}
				</span>
			</div>
			<svg
				viewBox={`0 0 ${Math.max(values.length - 1, 1)} 32`}
				preserveAspectRatio="none"
				className="h-[64px] w-full text-accent"
				role="img"
			>
				<title>{title}</title>
				<polyline
					points={points}
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
		</div>
	)
}

function ViewAll(props: { to: string; label: string }) {
	return (
		<div className="flex justify-end px-[16px] py-[10px]">
			<Link to={props.to} className="text-[12px] text-accent press-down">
				{props.label} →
			</Link>
		</div>
	)
}
