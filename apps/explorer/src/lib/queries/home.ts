import { queryOptions } from '@tanstack/react-query'
import { fetchHomeStats } from '#lib/server/home'
import { getTempoChain } from '#wagmi.config'

export function homeStatsQueryOptions() {
	return queryOptions({
		queryKey: ['home-stats', getTempoChain().id],
		// A failed read is no dashboard until a later poll succeeds.
		queryFn: () => fetchHomeStats().catch(() => null),
		refetchInterval: 3_000,
	})
}
