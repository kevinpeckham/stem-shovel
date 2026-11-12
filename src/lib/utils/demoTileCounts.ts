/**
 * What each demo tile in the song page's Demos view shows beside its size:
 * how many comments its demo has and how many are new to the signed-in
 * person. The open demo is left out: its comments are above the list.
 */
export function demoTileCounts(
	demos: { id: string }[],
	comments: { demoId: string }[],
	newComments: Record<string, number>,
	openId: string | null,
): Map<string, { count: number; fresh: number }> {
	const counts = new Map<string, { count: number; fresh: number }>();
	for (const d of demos) {
		if (d.id !== openId) counts.set(d.id, { count: 0, fresh: newComments[d.id] ?? 0 });
	}
	for (const c of comments) {
		const tile = counts.get(c.demoId);
		if (tile) tile.count++;
	}
	return counts;
}
