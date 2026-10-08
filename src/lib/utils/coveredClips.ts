/**
 * Take lanes (docs/multitrack-recorder.md, "Takes"): the clips of a track
 * that a new take covers end to end are replaced by it, their sources
 * kept as the new clip's alternate takes. Returns those clips and the
 * alternates the new clip inherits (the covered clips' own sources first,
 * then their alternates, at most `cap`). A MIDI clip (notes, no source)
 * is covered like any other and leaves no alternate.
 */
export function coveredClips<
	C extends {
		id: string;
		trackId: string;
		start: number;
		duration: number;
		sourceId?: string;
		alternates?: string[];
	},
>(
	clips: C[],
	take: { trackId: string; start: number; duration: number },
	cap = 32,
): { covered: C[]; alternates: string[] } {
	const epsilon = 0.005;
	const end = take.start + take.duration;
	const covered = clips.filter(
		(c) =>
			c.trackId === take.trackId &&
			c.start >= take.start - epsilon &&
			c.start + c.duration <= end + epsilon,
	);
	const seen = new Set<string>();
	const alternates: string[] = [];
	for (const id of covered.flatMap((c) => [c.sourceId, ...(c.alternates ?? [])])) {
		if (id === undefined || seen.has(id)) continue;
		seen.add(id);
		alternates.push(id);
	}
	return { covered, alternates: alternates.slice(0, cap) };
}
