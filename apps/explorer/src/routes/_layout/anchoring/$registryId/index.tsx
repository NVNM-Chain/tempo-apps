import {
	createFileRoute,
	Link,
	notFound,
	stripSearchParams,
} from '@tanstack/react-router'
import * as React from 'react'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { DataGrid } from '#comps/DataGrid'
import { InfoCard } from '#comps/InfoCard'
import { Sections } from '#comps/Sections'
import { TransactionCell } from '#comps/TransactionCell'
import {
	ANCHORING_PER_PAGE,
	type AnchoringEvent,
	type AnchoringRecord,
	parseAnchoringId,
} from '#lib/domain/anchoring'
import { useMediaQuery } from '#lib/hooks'
import { fetchAnchoringRegistry } from '#lib/server/anchoring'
import { zPage } from '#lib/zod'

export const Route = createFileRoute('/_layout/anchoring/$registryId/')({
	component: RegistryPage,
	notFoundComponent: () => (
		<div className="flex flex-1 items-center justify-center px-4 pt-20">
			<h1 className="text-[32px] font-medium text-primary">
				Registry Not Found
			</h1>
		</div>
	),
	validateSearch: z.object({ page: zPage() }),
	search: { middlewares: [stripSearchParams({ page: 1 })] },
	loaderDeps: ({ search: { page } }) => ({ page }),
	loader: async ({ params, deps }) => {
		const registryId = parseAnchoringId(params.registryId)
		if (!registryId) throw notFound()
		const found = await fetchAnchoringRegistry({
			data: { registryId, page: deps.page },
		})
		if (!found) throw notFound()
		return found
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.registry.name ?? 'Registry'} – Tempo Explorer` },
		],
	}),
})

function RegistryPage(): React.JSX.Element {
	const { registry, records, total, events, unlisted } = Route.useLoaderData()
	const { page } = Route.useSearch()
	const mode = useMediaQuery('(max-width: 799px)') ? 'stacked' : 'tabs'
	const [activeSection, setActiveSection] = React.useState(0)
	const eventsMore = events.length > ANCHORING_PER_PAGE

	return (
		<div className="max-[800px]:flex max-[800px]:flex-col max-[800px]:pt-10 max-[800px]:pb-8 grid w-full grid-cols-[auto_1fr] gap-[14px] px-4 pt-20 pb-16 min-w-0 min-[1240px]:max-w-[1280px]">
			<BreadcrumbsSlot className="col-span-full" />
			<InfoCard
				title={<InfoCard.Title>Registry</InfoCard.Title>}
				className="self-start max-[800px]:w-full min-[800px]:max-w-[360px]"
				sections={[
					{ label: 'Id', value: <span>#{registry.id}</span> },
					{
						label: 'Name',
						value: <span className="break-all">{registry.name}</span>,
					},
					...(registry.description
						? [{ label: 'Description', value: registry.description }]
						: []),
					{
						label: 'Creator',
						value: (
							<span className="break-all font-mono">{registry.creator}</span>
						),
					},
					{ label: 'Created', value: registry.createdAt },
					{
						label: 'Metadata',
						value: (
							<span className="break-all font-mono">
								{registry.metadata || '—'}
							</span>
						),
					},
				]}
			/>
			<Sections
				mode={mode}
				activeSection={activeSection}
				onSectionChange={setActiveSection}
				sections={[
					{
						title: 'Records',
						totalItems: total,
						autoCollapse: false,
						content: (
							<RecordsGrid
								registryId={registry.id}
								records={records}
								total={total}
								page={page}
							/>
						),
					},
					{
						title: eventsMore ? 'Latest transactions' : 'Transactions',
						totalItems: eventsMore ? `${ANCHORING_PER_PAGE}+` : events.length,
						autoCollapse: false,
						content: (
							<>
								{unlisted.length > 0 && events.length > 0 && (
									<p className="px-[16px] pt-[12px] text-[13px] text-tertiary">
										The indexer did not answer for {unlisted.join(', ')}; those
										are missing.
									</p>
								)}
								<EventsGrid events={events} unlisted={unlisted} />
							</>
						),
					},
				]}
			/>
		</div>
	)
}

function RecordsGrid(props: {
	registryId: number
	records: AnchoringRecord[]
	total: number
	page: number
}) {
	const columns: DataGrid.Column[] = [
		{ label: 'Record', width: 'max-content' },
		{ label: 'Checksum', width: '3fr', minWidth: 200 },
		{ label: 'Status', width: '1fr', minWidth: 90 },
		{ label: 'Versions', align: 'end', width: '1fr', minWidth: 80 },
		{ label: 'Anchored', align: 'end', width: 'max-content' },
	]
	return (
		<DataGrid
			columns={{ stacked: columns.slice(0, 2), tabs: columns }}
			items={(mode) =>
				props.records.map((record) => ({
					key: String(record.recordId),
					cells: [
						<span key="record" className="font-mono text-secondary">
							#{record.recordId}
						</span>,
						<span
							key="checksum"
							className="truncate font-mono"
							title={record.checksumAlgo}
						>
							{record.checksum}
						</span>,
						<span key="status">{record.status}</span>,
						<span key="versions" className="text-secondary">
							{record.index}
						</span>,
						<span key="anchored" className="whitespace-nowrap text-tertiary">
							{record.timestamp}
						</span>,
					].slice(0, mode === 'stacked' ? 2 : undefined),
					link: {
						href: `/anchoring/${props.registryId}/${record.recordId}`,
						title: `View record ${record.recordId}`,
					},
				}))
			}
			totalItems={props.total}
			page={props.page}
			itemsPerPage={ANCHORING_PER_PAGE}
			itemsLabel="records"
			emptyState="This registry has no records."
		/>
	)
}

function EventsGrid(props: { events: AnchoringEvent[]; unlisted: string[] }) {
	const events = props.events.slice(0, ANCHORING_PER_PAGE)
	const columns: DataGrid.Column[] = [
		{ label: 'Event', width: 'max-content' },
		{ label: 'Transaction', width: '2fr', minWidth: 160 },
		{ label: 'Caller', width: '2fr', minWidth: 160 },
		{ label: 'Block', align: 'end', width: 'max-content' },
	]
	return (
		<DataGrid
			columns={{ stacked: columns.slice(0, 2), tabs: columns }}
			items={(mode) =>
				events.map((event) => ({
					key: `${event.transactionHash}-${event.logIndex}`,
					cells: [
						<span key="event">
							{event.event}
							{event.recordId === undefined ? null : (
								<span className="text-tertiary"> #{event.recordId}</span>
							)}
						</span>,
						<TransactionCell
							key="transaction"
							hash={event.transactionHash as `0x${string}`}
						/>,
						<Address
							key="caller"
							address={event.caller as `0x${string}`}
							chars={5}
						/>,
						<Link
							key="block"
							to="/block/$id"
							params={{ id: String(event.blockNumber) }}
							className="font-mono text-accent press-down"
						>
							{event.blockNumber}
						</Link>,
					].slice(0, mode === 'stacked' ? 2 : undefined),
				}))
			}
			totalItems={events.length}
			page={1}
			pages={1}
			itemsLabel="transactions"
			emptyState={
				props.unlisted.length > 0
					? 'The indexer could not list this registry’s transactions.'
					: 'No transaction for this registry. One seeded at genesis has none.'
			}
		/>
	)
}
