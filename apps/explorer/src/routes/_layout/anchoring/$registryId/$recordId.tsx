import {
	createFileRoute,
	Link,
	notFound,
	stripSearchParams,
} from '@tanstack/react-router'
import type * as React from 'react'
import * as z from 'zod/mini'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { CopyButton } from '#comps/CopyButton'
import { DataGrid } from '#comps/DataGrid'
import { InfoCard } from '#comps/InfoCard'
import { Sections } from '#comps/Sections'
import { ANCHORING_PER_PAGE, parseAnchoringId } from '#lib/domain/anchoring'
import { useMediaQuery } from '#lib/hooks'
import { fetchAnchoringRecord } from '#lib/server/anchoring'
import { zPage } from '#lib/zod'

export const Route = createFileRoute(
	'/_layout/anchoring/$registryId/$recordId',
)({
	component: RecordPage,
	notFoundComponent: () => (
		<div className="flex flex-1 items-center justify-center px-4 pt-20">
			<h1 className="text-[32px] font-medium text-primary">Record Not Found</h1>
		</div>
	),
	validateSearch: z.object({ page: zPage() }),
	search: { middlewares: [stripSearchParams({ page: 1 })] },
	loaderDeps: ({ search: { page } }) => ({ page }),
	loader: async ({ params, deps }) => {
		const registryId = parseAnchoringId(params.registryId)
		const recordId = parseAnchoringId(params.recordId)
		if (!registryId || !recordId) throw notFound()
		const found = await fetchAnchoringRecord({
			data: { registryId, recordId, page: deps.page },
		})
		if (!found) throw notFound()
		return found
	},
	head: ({ params }) => ({
		meta: [
			{
				title: `Record ${params.registryId}/${params.recordId} – NVNMChain Explorer`,
			},
		],
	}),
})

function RecordPage(): React.JSX.Element {
	const { latest, versions } = Route.useLoaderData()
	const { page } = Route.useSearch()
	const mode = useMediaQuery('(max-width: 799px)') ? 'stacked' : 'tabs'
	const columns: DataGrid.Column[] = [
		{ label: 'Version', width: 'max-content' },
		{ label: 'URI · metadata', width: '3fr', minWidth: 200 },
		{ label: 'Status', width: '1fr', minWidth: 90 },
		{ label: 'Anchored', align: 'end', width: 'max-content' },
	]

	return (
		<div className="max-[800px]:flex max-[800px]:flex-col max-[800px]:pt-10 max-[800px]:pb-8 grid w-full grid-cols-[auto_1fr] gap-[14px] px-4 pt-20 pb-16 min-w-0 min-[1240px]:max-w-[1280px]">
			<BreadcrumbsSlot className="col-span-full" />
			<InfoCard
				title={<InfoCard.Title>Record</InfoCard.Title>}
				className="self-start max-[800px]:w-full min-[800px]:max-w-[360px]"
				sections={[
					{ label: 'Id', value: <span>#{latest.recordId}</span> },
					{
						label: 'Registry',
						value: (
							<Link
								to="/anchoring/$registryId"
								params={{ registryId: String(latest.registryId) }}
								className="text-accent press-down"
							>
								#{latest.registryId}
							</Link>
						),
					},
					{ label: 'Status', value: latest.status },
					{ label: 'Versions', value: latest.index },
					{
						label: 'Checksum',
						value: (
							<span className="flex items-center gap-1 min-w-0">
								<span className="break-all font-mono">{latest.checksum}</span>
								<CopyButton value={latest.checksum} ariaLabel="Copy checksum" />
							</span>
						),
					},
					{ label: 'Algorithm', value: latest.checksumAlgo || '—' },
				]}
			/>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Versions',
						totalItems: latest.index,
						autoCollapse: false,
						content: (
							<DataGrid
								columns={{ stacked: columns.slice(0, 2), tabs: columns }}
								items={(gridMode) =>
									versions.map((version) => ({
										key: String(version.index),
										cells: [
											<span key="version" className="font-mono text-secondary">
												v{version.index}
												{version.isLatest ? (
													<span className="text-positive"> latest</span>
												) : null}
											</span>,
											<span key="uri" className="flex flex-col min-w-0">
												<span className="break-all">{version.uri || '—'}</span>
												{version.metadata ? (
													<span className="break-all font-mono text-tertiary">
														{version.metadata}
													</span>
												) : null}
											</span>,
											<span key="status">{version.status}</span>,
											<span
												key="anchored"
												className="whitespace-nowrap text-tertiary"
											>
												{version.timestamp}
											</span>,
										].slice(0, gridMode === 'stacked' ? 2 : undefined),
									}))
								}
								totalItems={latest.index}
								page={page}
								itemsPerPage={ANCHORING_PER_PAGE}
								itemsLabel="versions"
							/>
						),
					},
				]}
			/>
		</div>
	)
}
