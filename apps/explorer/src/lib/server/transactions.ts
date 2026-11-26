import { createServerFn } from '@tanstack/react-start'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TXS_PER_PAGE } from '#lib/constants'
import { indexer } from '#lib/server/dex-indexer'
import { readTransactions } from '#lib/server/transaction-list'
import { getWagmiConfig } from '#wagmi.config'

/** One page of every indexed transaction, and how many there are. */
export const fetchTransactions = createServerFn({ method: 'GET' })
	.inputValidator(z.object({ page: z.coerce.number().check(z.gte(1)) }))
	.handler(async ({ data }) => {
		const chainId = getChainId(getWagmiConfig())
		const [transactions, [counted]] = await Promise.all([
			readTransactions(chainId, TXS_PER_PAGE, (data.page - 1) * TXS_PER_PAGE),
			indexer(chainId, 'SELECT count() AS n FROM txs'),
		])
		return { transactions, total: Number(counted?.n ?? 0) }
	})
