import * as Bun from 'bun'

import { getSolcPath, getVyperPath } from './compiler.ts'

const headers = new Headers({
	'X-Request-Id': Bun.randomUUIDv7(),
})

/** Emit structured JSON matching the worker's `jsonSink` format from `src/logger.ts`. */
function log(
	level: 'info' | 'warn' | 'error',
	event: string,
	properties?: Record<string, unknown>,
) {
	console[level](JSON.stringify({ event, ...properties }))
}

/** Under the 15-minute limit on the job runner's alarm that waits for the compile. */
const COMPILE_TIMEOUT_MS = 10 * 60 * 1_000

/** Runs `compiler --standard-json` on `input`, killing it when the request ends or the time runs out. */
async function compile(
	request: Request,
	compiler: string,
	input: object,
	env?: Record<string, string | undefined>,
) {
	const timeout = AbortSignal.timeout(COMPILE_TIMEOUT_MS)
	const proc = Bun.spawn([compiler, '--standard-json'], {
		env,
		signal: AbortSignal.any([request.signal, timeout]),
		stdin: new TextEncoder().encode(JSON.stringify(input)),
		stdout: 'pipe',
		stderr: 'pipe',
	})

	const stdout = await new Response(proc.stdout).text()
	const stderr = await new Response(proc.stderr).text()
	await proc.exited

	if (timeout.aborted) throw new Error('Compilation timed out')
	return { stdout, stderr }
}

const server = Bun.serve({
	port: 8080,
	development: Bun.env.NODE_ENV === 'development',
	routes: {
		'/compile': {
			POST: async (request, server) => {
				const address = server.requestIP(request as Request)
				if (address)
					log('info', 'compile_request', {
						from: `${address.address}:${address.port}`,
					})

				const body = await request.json<{
					input: object
					compilerVersion: string
				}>()
				if (!Object.hasOwn(body, 'input'))
					return Response.json({ error: 'Missing input' }, { status: 400 })

				if (!Object.hasOwn(body, 'compilerVersion'))
					return Response.json(
						{ error: 'Missing compilerVersion' },
						{ status: 400 },
					)

				const solcPath = await getSolcPath(body.compilerVersion)

				const { stdout, stderr } = await compile(request, solcPath, body.input)

				if (stderr) log('error', 'compile_stderr', { stderr })

				if (!stdout)
					return Response.json(
						{ error: 'Failed to compile', stderr },
						{ status: 500 },
					)

				try {
					const output = JSON.parse(stdout)
					return Response.json(output, { status: 200 })
				} catch (error) {
					log('error', 'compile_parse_failed', {
						error: error instanceof Error ? error.message : String(error),
					})
					return Response.json(
						{ error: 'Failed to parse solc output', stdout, stderr },
						{ status: 500 },
					)
				}
			},
		},
		'/compile/vyper': {
			POST: async (request, server) => {
				const address = server.requestIP(request as Request)
				if (address)
					log('info', 'compile_vyper_request', {
						from: `${address.address}:${address.port}`,
					})

				const body = await request.json<{
					input: object
					compilerVersion: string
				}>()
				if (!Object.hasOwn(body, 'input'))
					return Response.json({ error: 'Missing input' }, { status: 400 })

				if (!Object.hasOwn(body, 'compilerVersion'))
					return Response.json(
						{ error: 'Missing compilerVersion' },
						{ status: 400 },
					)

				const vyperPath = await getVyperPath(body.compilerVersion)

				const { stdout, stderr } = await compile(request, vyperPath, body.input)

				// Vyper < 0.4.0 outputs warnings to stderr, so only log if it looks like an error
				if (stderr && !stderr.includes('Warning'))
					log('error', 'compile_vyper_stderr', { stderr })

				if (!stdout)
					return Response.json(
						{ error: 'Failed to compile', stderr },
						{ status: 500 },
					)

				try {
					const output = JSON.parse(stdout)
					return Response.json(output, { status: 200 })
				} catch (error) {
					log('error', 'compile_vyper_parse_failed', {
						error: error instanceof Error ? error.message : String(error),
					})
					return Response.json(
						{ error: 'Failed to parse vyper output', stdout, stderr },
						{ status: 500 },
					)
				}
			},
		},
		'/health': new Response('ok'),
		'/metrics': (_, server) =>
			new Response(`Active requests: ${server.pendingRequests}`),
	},
	error: (error) => {
		log('error', 'unhandled_server_error', {
			error: error instanceof Error ? error.message : String(error),
		})
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error'
		return new Response(errorMessage, { status: 500, headers })
	},
})

if (Bun.env.NODE_ENV === 'development')
	log('info', 'server_started', {
		url: server.url.toString().replaceAll(`${server.port}/`, `${server.port}`),
	})
else log('info', 'server_started', { port: server.port })
