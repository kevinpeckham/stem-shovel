/**
 * Clips removed with the gaps they leave closed (docs/dawn-daw-plan.md,
 * D4): on each track the clips after a removed one move earlier by its
 * length (by the length of the span the removed clips covered together,
 * where several touched). Returns the remaining clips, the later ones
 * shifted. A plain delete leaves the rest where it is.
 */
export function rippleDelete<
	C extends { id: string; trackId: string; start: number; duration: number },
>(clips: C[], ids: Iterable<string>): C[] {
	const gone = new Set(ids);
	const removed = clips.filter((c) => gone.has(c.id));
	if (removed.length === 0) return clips;
	const round4 = (x: number) => Math.round(x * 10000) / 10000;
	// Per track, the spans the removed clips cover, merged where they touch or overlap.
	const spans = new Map<string, { start: number; end: number }[]>();
	for (const c of [...removed].sort((a, b) => a.start - b.start)) {
		const list = spans.get(c.trackId) ?? [];
		const last = list[list.length - 1];
		const end = c.start + c.duration;
		if (last && c.start <= last.end + 1e-6) last.end = Math.max(last.end, end);
		else list.push({ start: c.start, end });
		spans.set(c.trackId, list);
	}
	return clips
		.filter((c) => !gone.has(c.id))
		.map((c) => {
			const list = spans.get(c.trackId);
			if (!list) return c;
			let shift = 0;
			for (const s of list) if (c.start >= s.end - 1e-6) shift += s.end - s.start;
			return shift ? { ...c, start: round4(c.start - shift) } : c;
		});
}
