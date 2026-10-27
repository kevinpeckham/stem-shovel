/** The items whose title (or "Untitled" when it is empty) contains the query, case-insensitive and trimmed; an empty query keeps them all. */
export function filterByTitle<T extends { title: string }>(items: T[], query: string): T[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter((item) => (item.title || "Untitled").toLowerCase().includes(q));
}
