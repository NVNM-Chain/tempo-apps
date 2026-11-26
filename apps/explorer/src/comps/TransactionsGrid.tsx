import { Link } from '@tanstack/react-router'
import { AddressCell } from '#comps/AddressCell'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#comps/TimeFormat'
import type { ListedTransaction } from '#lib/server/transaction-list'

/** Indexed transactions as rows: hash and failure, method, sides, block and time. */
export function TransactionsGrid(props: {
	transactions: ListedTransaction[]
	totalItems: number
	page: number
	itemsPerPage?: number
	pagination: DataGrid.Props['pagination']
	loading?: boolean
}) {
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	const columns: DataGrid.Column[] = [
		{ label: 'Hash', width: '2fr' },
		{ label: 'Block', width: '1fr' },
		{ label: 'Method', width: '1fr' },
		{ label: 'From', width: '2fr' },
		{ label: 'To', width: '2fr' },
		{
			align: 'end',
			label: (
				<TimeColumnHeader
					label="Time"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
				/>
			),
			width: '1fr',
			minWidth: 80,
		},
	]
	return (
		<DataGrid
			columns={{ stacked: columns, tabs: columns }}
			items={() =>
				props.transactions.map((tx) => ({
					key: tx.hash,
					cells: [
						<span
							key="hash"
							className="flex items-center gap-[6px] min-w-0 w-full"
						>
							<Link
								to="/tx/$hash"
								params={{ hash: tx.hash }}
								className="text-[13px] text-tertiary press-down min-w-0 w-full font-mono"
							>
								<Midcut value={tx.hash} prefix="0x" />
							</Link>
							{tx.failed && (
								<span className="text-[12px] text-negative">Failed</span>
							)}
						</span>,
						<Link
							key="block"
							to="/block/$id"
							params={{ id: String(tx.block) }}
							className="font-sans tabular-nums text-accent press-down"
						>
							#{tx.block}
						</Link>,
						<span
							key="method"
							className="text-[13px] text-secondary truncate"
							title={tx.method ?? undefined}
						>
							{tx.method ?? '—'}
						</span>,
						<AddressCell key="from" address={tx.from} />,
						tx.to ? (
							<AddressCell key="to" address={tx.to} />
						) : (
							<span key="to" className="text-[13px] text-tertiary">
								Contract creation
							</span>
						),
						<span
							key="time"
							className="font-sans text-secondary tabular-nums whitespace-nowrap"
						>
							<FormattedTimestamp
								timestamp={BigInt(tx.timestamp)}
								format={timeFormat}
							/>
						</span>,
					],
				}))
			}
			totalItems={props.totalItems}
			page={props.page}
			itemsLabel="transactions"
			itemsPerPage={props.itemsPerPage}
			loading={props.loading}
			emptyState="No transactions indexed yet."
			pagination={props.pagination}
		/>
	)
}
