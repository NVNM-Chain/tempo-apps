import { queryOptions } from '@tanstack/react-query'
import { fetchTransactions } from '#lib/server/transactions'
import { getTempoChain } from '#wagmi.config'

export function transactionsQueryOptions(page: number) {
	return queryOptions({
		queryKey: ['transactions', getTempoChain().id, page],
		queryFn: () => fetchTransactions({ data: { page } }),
		retry: 1,
	})
}
