import type { SortDir } from "./sortRows";

/**
 * The sort after a click on a column's header: the same column flips its
 * direction; another column starts in its own first direction (`desc`
 * for the ones whose newest or largest matters first, like dates).
 */
export function nextSort<K extends string>(
	current: { key: K; dir: SortDir },
	key: K,
	descFirst: readonly K[] = [],
): { key: K; dir: SortDir } {
	if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
	return { key, dir: descFirst.includes(key) ? "desc" : "asc" };
}
