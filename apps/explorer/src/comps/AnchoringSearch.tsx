import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { cx } from '#lib/css'
import { searchAnchoring } from '#lib/server/anchoring'

const LIMIT = 8

/** The anchoring search box: matches as the reader types, every match on Enter. */
export function AnchoringSearch(props: { q: string }): React.JSX.Element {
	const navigate = useNavigate()
	const listId = React.useId()
	const [text, setText] = React.useState(props.q)
	const [query, setQuery] = React.useState(props.q.trim())
	const [open, setOpen] = React.useState(false)
	const [selected, setSelected] = React.useState(-1)

	React.useEffect(() => setText(props.q), [props.q])
	// A keystroke waits for the next one before asking the node.
	React.useEffect(() => {
		const timer = setTimeout(() => setQuery(text.trim()), 200)
		return () => clearTimeout(timer)
	}, [text])

	const isId = /^\d+$/.test(query)
	const { data, isFetching } = useQuery({
		queryKey: ['anchoring-suggestions', query],
		queryFn: () => searchAnchoring({ data: { q: query, limit: LIMIT } }),
		enabled: query !== '' && !isId,
		placeholderData: keepPreviousData,
	})

	const suggestions = isId
		? [{ href: `/anchoring/${query}`, label: `Registry #${query}`, detail: '' }]
		: [
				...(data?.registries ?? []).map((registry) => ({
					href: `/anchoring/${registry.id}`,
					label: registry.name,
					detail: `Registry #${registry.id}`,
				})),
				...(data?.records ?? []).map((record) => ({
					href: `/anchoring/${record.registryId}/${record.recordId}`,
					label: record.checksum,
					detail: `Record ${record.registryId}/${record.recordId}`,
				})),
			].slice(0, LIMIT)
	const listed = open && query !== ''

	function choose(index: number) {
		const suggestion = suggestions[index]
		setOpen(false)
		if (suggestion) void navigate({ href: suggestion.href })
	}

	return (
		<search
			className="relative block"
			// Focus moving onto an option, as a screen reader's does, keeps the list.
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
			}}
		>
			<form
				className="flex items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault()
					setOpen(false)
					void navigate({
						to: '/anchoring',
						search: { page: 1, q: text.trim() || undefined },
					})
				}}
			>
				<input
					name="q"
					value={text}
					placeholder="Registry id, name or checksum"
					aria-label="Search anchoring"
					autoComplete="off"
					spellCheck={false}
					role="combobox"
					aria-expanded={listed}
					aria-controls={listId}
					aria-autocomplete="list"
					aria-activedescendant={
						selected >= 0 ? `${listId}-${selected}` : undefined
					}
					className="h-7 w-[260px] rounded-[4px] border border-base-border bg-base px-2 text-[12px] text-primary outline-none placeholder:text-tertiary focus:border-accent"
					onChange={(event) => {
						setText(event.target.value)
						setOpen(true)
						setSelected(-1)
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={(event) => {
						if (event.key === 'Escape') return setOpen(false)
						if (!open || suggestions.length === 0) return
						if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
							event.preventDefault()
							const step = event.key === 'ArrowDown' ? 1 : -1
							// -1 is the box itself: past either end, the cursor returns to it.
							setSelected((previous) => {
								const next = previous + step
								if (next < -1) return suggestions.length - 1
								return next >= suggestions.length ? -1 : next
							})
						}
						if (event.key === 'Enter' && selected >= 0) {
							event.preventDefault()
							choose(selected)
						}
					}}
				/>
				<button
					type="submit"
					className="h-7 rounded-[4px] border border-base-border px-2 text-[12px] text-secondary hover:bg-base-alt press-down"
				>
					Search
				</button>
			</form>
			{listed ? (
				<div
					id={listId}
					role="listbox"
					aria-label="Anchoring matches"
					className="absolute right-0 z-50 mt-1 w-[380px] max-w-[90vw] overflow-hidden rounded-[10px] border border-base-border bg-surface py-1 shadow-sm"
				>
					{suggestions.length === 0 ? (
						<div className="px-3 py-2 text-[12px] text-tertiary">
							{isFetching ? 'Searching…' : 'No matches'}
						</div>
					) : (
						suggestions.map((suggestion, index) => (
							<button
								key={suggestion.href}
								id={`${listId}-${index}`}
								type="button"
								role="option"
								aria-selected={index === selected}
								onMouseDown={(event) => {
									event.preventDefault()
									choose(index)
								}}
								// No mouse behind it (a screen reader or the keyboard); a mouse chose on mousedown.
								onClick={(event) => {
									if (event.detail === 0) choose(index)
								}}
								className={cx(
									'flex w-full items-center justify-between gap-3 px-3 py-[6px] text-left press-down hover:bg-base-alt/25',
									index === selected && 'bg-base-alt/25',
								)}
							>
								<span className="truncate text-[12px] text-primary">
									{suggestion.label}
								</span>
								<span className="shrink-0 text-[12px] text-tertiary">
									{suggestion.detail}
								</span>
							</button>
						))
					)}
				</div>
			) : null}
		</search>
	)
}
