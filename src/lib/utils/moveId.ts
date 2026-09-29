/** The ids with one of them moved to an index (clamped to the list); unchanged when the id is not there. */
export function moveId(ids: readonly string[], id: string, index: number): string[] {
	if (!ids.includes(id)) return [...ids];
	const rest = ids.filter((x) => x !== id);
	rest.splice(Math.max(0, Math.min(rest.length, index)), 0, id);
	return rest;
}
