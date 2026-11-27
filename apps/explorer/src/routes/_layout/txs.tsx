import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Sections } from '#comps/Sections'
import { TransactionsGrid } from '#comps/TransactionsGrid'
import { transactionsQueryOptions } from '#lib/queries'
import { TXS_PER_PAGE } from '#lib/constants'

export const Route = createFileRoute('/_layout/txs')({
	component: TransactionsPage,
	head: () => ({ meta: [{ title: 'Transactions – Tempo Explorer' }] }),
	validateSearch: z.object({ page: z.optional(z.number()) }),
	loaderDeps: ({ search: { page } }) => ({ page: page ?? 1 }),
	loader: ({ deps, context }) =>
		context.queryClient.prefetchQuery(transactionsQueryOptions(deps.page)),
})

/** Every indexed transaction, newest first. */
function TransactionsPage() {
	const { page = 1 } = Route.useSearch()
	const { data, isPending } = useQuery({
		...transactionsQueryOptions(page),
		placeholderData: keepPreviousData,
	})
	const total = data?.total ?? 0
	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-300 mx-auto w-full">
			<Sections
				mode="tabs"
				activeSection={0}
				sections={[
					{
						title: 'Transactions',
						totalItems: total || undefined,
						autoCollapse: false,
						content: (
							<TransactionsGrid
								transactions={data?.transactions ?? []}
								totalItems={total}
								page={page}
								itemsPerPage={TXS_PER_PAGE}
								loading={isPending}
								pagination="simple"
							/>
						),
					},
				]}
			/>
		</div>
	)
}
