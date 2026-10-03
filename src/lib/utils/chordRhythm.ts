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
/** Beats quantized to one, two or four: under a beat and a half is one, under three is two. */
export function quantizeBeats(beats: number): ChordBeats {
	if (beats < 1.5) return 1;
	if (beats < 3) return 2;
	return 4;
}

/** A held chord's beats at the tempo, as first jotted (revised by `jotLengths` when the next chord starts). */
export function beatsFromHold(heldMs: number, bpm: number): ChordBeats {
	return quantizeBeats(heldMs / beatMs(bpm));
}

/**
 * A chord's lengths once the next chord starts: it lasts until the next
 * one (the time to find the next wedge is not a rest), unless the silence
 * after it was two beats or more, when the chord keeps its held length and
 * the silence is a rest of two or four beats; a silence over eight beats
 * is thinking time, no rest.
 */
export function jotLengths(
	heldBeats: number,
	untilNextBeats: number,
): { chord: ChordBeats; rest: ChordBeats | 0 } {
	const silence = untilNextBeats - heldBeats;
	if (silence < 2) return { chord: quantizeBeats(Math.max(heldBeats, untilNextBeats)), rest: 0 };
	const chord = quantizeBeats(heldBeats);
	if (silence > 8) return { chord, rest: 0 };
	return { chord, rest: silence < 3 ? 2 : 4 };
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
