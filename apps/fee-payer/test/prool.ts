import { Server } from 'prool'
import * as TestContainers from 'prool/testcontainers'

export const port = 9545

export async function createServer(tag = 'latest') {
	return Server.create({
		instance: TestContainers.Instance.tempo({
			blockTime: '2ms',
			// prool 0.2.4 passes this flag, which Tempo v1.19 refuses; undefined drops it.
			engine: { legacyStateRoot: undefined },
			port,
			image: `ghcr.io/tempoxyz/tempo:${tag}`,
		}),
		port,
	})
}
