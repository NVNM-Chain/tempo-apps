import {
	createFileRoute,
	redirect,
	stripSearchParams,
} from '@tanstack/react-router'
import * as React from 'react'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { AnchoringSearch } from '#comps/AnchoringSearch'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import {
	ANCHORING_ADDRESS,
	ANCHORING_PER_PAGE,
	type AnchoringRecord,
	type AnchoringRegistry,
} from '#lib/domain/anchoring'
import { useMediaQuery } from '#lib/hooks'
import {
	fetchAnchoringRegistries,
	searchAnchoringPage,
} from '#lib/server/anchoring'
import { zPage } from '#lib/zod'

const defaultSearch = { page: 1, q: '' } as const

export const Route = createFileRoute('/_layout/anchoring/')({
	component: AnchoringPage,
	validateSearch: z.object({
		page: zPage(),
		q: z.prefault(z.string(), defaultSearch.q),
	}),
	search: { middlewares: [stripSearchParams(defaultSearch)] },
	loaderDeps: ({ search: { page, q } }) => ({ page, q: q.trim() }),
	loader: async ({ deps: { page, q } }) => {
		if (/^\d+$/.test(q))
			throw redirect({
				to: '/anchoring/$registryId',
				params: { registryId: q },
			})
		if (q) {
			const found = await searchAnchoringPage({ data: { q, page } })
			return { ...found, total: undefined }
		}
		const listed = await fetchAnchoringRegistries({ data: { page } })
		return { ...listed, records: [] as AnchoringRecord[], more: false }
	},
	head: () => ({ meta: [{ title: 'Anchoring – Tempo Explorer' }] }),
})

function AnchoringPage(): React.JSX.Element {
	const { page, q } = Route.useSearch()
	const { registries, records, total, more } = Route.useLoaderData()
	const mode = useMediaQuery('(max-width: 799px)') ? 'stacked' : 'tabs'
	const [activeSection, setActiveSection] = React.useState(0)

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<p className="text-[12px] text-secondary flex items-center gap-1">
				Read from the anchoring contract at
				<Address address={ANCHORING_ADDRESS} chars={4} />
			</p>
			<Sections
				mode={mode}
				activeSection={activeSection}
				onSectionChange={setActiveSection}
				sections={[
					{
						title: q ? `Registries matching “${q}”` : 'Registries',
						totalItems: total,
						autoCollapse: false,
						contextual: <AnchoringSearch q={q} />,
						content: (
							<RegistriesGrid
								registries={registries}
								total={total}
								more={more}
								page={page}
								emptyState={
									q ? 'No registry name matches.' : 'No registries yet.'
								}
							/>
						),
					},
					{
						title: `Records with checksum “${q}”`,
						totalItems: records.length,
						autoCollapse: false,
						visible: Boolean(q),
						content: <RecordsGrid records={records} />,
					},
				]}
			/>
		</div>
	)
}

function RegistriesGrid(props: {
	registries: AnchoringRegistry[]
	/** None for a search, which pages on while `more` says another page follows. */
	total: number | undefined
	more: boolean
	page: number
	emptyState: string
}) {
	const { registries, total, more, page } = props
	const columns: DataGrid.Column[] = [
		{ label: 'Id', width: 'max-content' },
		{ label: 'Registry', width: '3fr', minWidth: 200 },
		{ label: 'Creator', width: '2fr', minWidth: 160 },
		{ label: 'Created', align: 'end', width: 'max-content' },
	]
	return (
		<DataGrid
			columns={{ stacked: columns.slice(0, 2), tabs: columns }}
			items={(mode) =>
				registries.map((registry) => ({
					key: String(registry.id),
					cells: [
						<span key="id" className="font-mono text-secondary">
							#{registry.id}
						</span>,
						<span key="name" className="flex flex-col min-w-0">
							<span className="truncate text-primary">{registry.name}</span>
							{registry.description ? (
								<span className="truncate text-tertiary">
									{registry.description}
								</span>
							) : null}
						</span>,
						<span
							key="creator"
							className="truncate font-mono text-secondary"
							title={registry.creator}
						>
							{registry.creator}
						</span>,
						<span key="created" className="whitespace-nowrap text-tertiary">
							{registry.createdAt}
						</span>,
					].slice(0, mode === 'stacked' ? 2 : undefined),
					link: {
						href: `/anchoring/${registry.id}`,
						title: `View registry ${registry.name}`,
					},
				}))
			}
			totalItems={total ?? registries.length}
			// Past a search's last page the page count is known.
			pages={
				total === undefined ? (more ? { hasMore: true } : page) : undefined
			}
			pagination={total === undefined ? 'simple' : 'default'}
			showSimpleCount={false}
			page={page}
			itemsPerPage={ANCHORING_PER_PAGE}
			itemsLabel="registries"
			emptyState={props.emptyState}
		/>
	)
}

function RecordsGrid(props: { records: AnchoringRecord[] }) {
	const columns: DataGrid.Column[] = [
		{ label: 'Record', width: 'max-content' },
		{ label: 'URI', width: '3fr', minWidth: 200 },
		{ label: 'Status', width: '1fr', minWidth: 90 },
		{ label: 'Anchored', align: 'end', width: 'max-content' },
	]
	return (
		<DataGrid
			columns={{ stacked: columns.slice(0, 2), tabs: columns }}
			items={(mode) =>
				props.records.map((record) => ({
					key: `${record.registryId}/${record.recordId}`,
					cells: [
						<span key="record" className="font-mono text-secondary">
							{record.registryId} / {record.recordId}{' '}
							<span className="text-tertiary">v{record.index}</span>
						</span>,
						<span key="uri" className="truncate text-secondary">
							{record.uri}
						</span>,
						<span key="status">{record.status}</span>,
						<span key="anchored" className="whitespace-nowrap text-tertiary">
							{record.timestamp}
						</span>,
					].slice(0, mode === 'stacked' ? 2 : undefined),
					link: {
						href: `/anchoring/${record.registryId}/${record.recordId}`,
						title: `View record ${record.registryId}/${record.recordId}`,
					},
				}))
			}
			totalItems={props.records.length}
			page={1}
			pages={1}
			itemsLabel="records"
			emptyState="No registry has a record with this checksum."
		/>
	)
}
