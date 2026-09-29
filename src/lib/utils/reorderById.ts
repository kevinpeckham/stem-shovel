/**
 * Items in the order their ids are listed: an id the list lacks is
 * ignored, and an item the list does not name keeps its place after the
 * named ones, in its old order. The engine's stems and a saved stem order
 * meet here, so a stale list (a stem removed or added meanwhile) never
 * loses anything.
 */
export function reorderById<T extends { id: string }>(
	items: readonly T[],
	ids: readonly string[],
): T[] {
	const byId = new Map(items.map((item) => [item.id, item]));
	const named: T[] = [];
	for (const id of ids) {
		const item = byId.get(id);
		if (item) {
			named.push(item);
			byId.delete(id);
		}
	}
	return [...named, ...items.filter((item) => byId.has(item.id))];
}
