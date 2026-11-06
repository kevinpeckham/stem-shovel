/**
 * Page `page` (1-based) of a list cut into pages of `size`: the slice, the
 * page number clamped to 1..pages, and how many pages there are. An empty
 * list is one empty page.
 */
export function pageSlice<T>(
	items: T[],
	page: number,
	size: number,
): { items: T[]; page: number; pages: number } {
	const pages = Math.max(1, Math.ceil(items.length / size));
	const p = Math.min(pages, Math.max(1, Math.floor(page)));
	return { items: items.slice((p - 1) * size, p * size), page: p, pages };
}
