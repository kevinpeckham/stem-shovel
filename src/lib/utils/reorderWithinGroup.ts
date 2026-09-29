/**
 * A list's order with one group of its members in a new order among
 * themselves: the group's slots in the list are refilled with the group in
 * its new order, so the members of other groups, and the interleaving
 * between groups, stay where they were. The project page keeps one order
 * across its Finished, In Progress and Ideas lists this way.
 */
export function reorderWithinGroup(all: readonly string[], group: readonly string[]): string[] {
	const members = new Set(group);
	let next = 0;
	return all.map((id) => (members.has(id) ? (group[next++] ?? id) : id));
}
