/**
 * The progression pad's rhythm (docs/chord-player.md, "The progression
 * pad"), after the chord player's rules: a chord's length comes from how
 * long it was held, quantized to 1, 2 or 4 beats at the tempo; the silence
 * between a release and the next press is a rest when it is musical (half
 * a beat to eight) and thinking time when it is longer.
 */
export type ChordBeats = 1 | 2 | 4;

function beatMs(bpm: number): number {
	return 60_000 / bpm;
}

/** Under a beat and a half is a one-beat stab, under three a half-note hold, longer a whole bar of 4/4. */
export function beatsFromHold(heldMs: number, bpm: number): ChordBeats {
	const beats = heldMs / beatMs(bpm);
	if (beats < 1.5) return 1;
	if (beats < 3) return 2;
	return 4;
}

/** Under half a beat is articulation (no rest); up to eight beats a rest of 1, 2 or 4; longer is thinking time (nothing). */
export function restBeatsFromGap(gapMs: number, bpm: number): ChordBeats | 0 {
	const beats = gapMs / beatMs(bpm);
	if (beats < 0.5) return 0;
	if (beats < 1.5) return 1;
	if (beats < 3) return 2;
	if (beats <= 8) return 4;
	return 0;
}

export type ProgressionEntry =
	| { kind: "chord"; label: string; wedge: string; notes: number[]; beats: ChordBeats }
	| { kind: "rest"; beats: ChordBeats };

/** The entries grouped into measures of `beatsPerBar` beats, an entry that straddles a bar line starting the next measure. */
export function measuresOf(entries: ProgressionEntry[], beatsPerBar: number): ProgressionEntry[][] {
	const measures: ProgressionEntry[][] = [];
	let current: ProgressionEntry[] = [];
	let filled = 0;
	for (const e of entries) {
		if (filled > 0 && filled + e.beats > beatsPerBar) {
			measures.push(current);
			current = [];
			filled = 0;
		}
		current.push(e);
		filled += e.beats;
		if (filled >= beatsPerBar) {
			measures.push(current);
			current = [];
			filled = 0;
		}
	}
	if (current.length) measures.push(current);
	return measures;
}

/** The next length when an entry is clicked: 1 → 2 → 4 → 1. */
export function nextBeats(beats: ChordBeats): ChordBeats {
	return beats === 1 ? 2 : beats === 2 ? 4 : 1;
}
