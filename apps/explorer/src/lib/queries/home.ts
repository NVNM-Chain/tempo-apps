import { queryOptions } from '@tanstack/react-query'
import { fetchHomeStats } from '#lib/server/home'
import { getTempoChain } from '#wagmi.config'

export function homeStatsQueryOptions() {
	return queryOptions({
		queryKey: ['home-stats', getTempoChain().id],
		queryFn: () => fetchHomeStats(),
		refetchInterval: 3_000,
		retry: 1,
	})
}
