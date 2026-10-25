/**
 * The project's chat feed after a poll (docs/chat.md, "The project page"):
 * `held` is what the panel shows, oldest first; `fresh` the newest page
 * just fetched (newest first, as the query answers) and `more` whether
 * there was more past it. A fresh message replaces its held copy (an
 * edit) or joins; a held one inside the fresh page's span that the page
 * no longer has was deleted and goes; older held ones stay as they were.
 * The result is oldest first.
 */
export function mergeFeed<M extends { id: string; createdAt: number }>(
	held: M[],
	fresh: M[],
	more: boolean,
): M[] {
	const freshIds = new Set(fresh.map((m) => m.id));
	// With nothing past the page, the page is the whole feed; else it spans back to its oldest.
	const since = more ? (fresh.at(-1)?.createdAt ?? Infinity) : -Infinity;
	const kept = held.filter((m) => !freshIds.has(m.id) && m.createdAt < since);
	return [...kept, ...fresh].toSorted(
		(a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
	);
}
