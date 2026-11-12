/**
 * What each demo tile in the song page's Demos view shows beside its size:
 * how many comments its demo has, how many are new to the signed-in
 * person, and whether it carries notes from its upload. The open demo is
 * left out: its comments and notes are above the list.
 */
export function demoTileCounts(
	demos: { id: string; notes?: string }[],
	comments: { demoId: string }[],
	newComments: Record<string, number>,
	openId: string | null,
): Map<string, { count: number; fresh: number; hasNotes: boolean }> {
	const counts = new Map<string, { count: number; fresh: number; hasNotes: boolean }>();
	for (const d of demos) {
		if (d.id === openId) continue;
		counts.set(d.id, { count: 0, fresh: newComments[d.id] ?? 0, hasNotes: !!d.notes?.trim() });
	}
	for (const c of comments) {
		const tile = counts.get(c.demoId);
		if (tile) tile.count++;
	}
	return counts;
}
