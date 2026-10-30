/** A run of bars with one chord, as the chord detector (`chordsPerBar`) returns them. */
interface Segment {
	bar: number;
	bars: number;
	start: number;
	chord: string;
	confidence: number;
}

/** "N.C." from the model and "" from the detector both mean no chord. */
const sameChord = (a: string, b: string) => {
	const norm = (c: string) => (c.trim() === "N.C." ? "" : c.trim());
	return norm(a) === norm(b);
};

/** Each bar of the runs with its start and the matcher's confidence; a bar inside a run starts where the run's bars would by even spacing. */
function barsOf(segments: Segment[]) {
	const out: { bar: number; start: number; chord: string; confidence: number }[] = [];
	const first = segments[0];
	const last = segments[segments.length - 1];
	const meanBar =
		first && last && last.bar > first.bar ? (last.start - first.start) / (last.bar - first.bar) : 0;
	segments.forEach((s, k) => {
		const next = segments[k + 1];
		const step = next ? (next.start - s.start) / Math.max(1, next.bar - s.bar) : meanBar;
		for (let i = 0; i < s.bars; i++)
			out.push({
				bar: s.bar + i,
				start: s.start + i * step,
				chord: s.chord,
				confidence: s.confidence,
			});
	});
	return out;
}

/**
 * The detector's runs rebuilt from the reconciler's chord per bar
 * (stem-bench Study 13), `chords[n - 1]` for bar n: runs of equal chords in the shape `chordsPerBar`
 * returns, each bar keeping the confidence the matcher gave it (a run's is
 * the mean of its bars'). `changed` counts the bars whose chord differs
 * from the detector's. A bar the answer does not reach keeps the
 * detector's chord.
 */
export function reconciledSegments(
	segments: Segment[],
	chords: string[],
): { segments: Segment[]; changed: number } {
	const out: (Segment & { sum: number })[] = [];
	let changed = 0;
	for (const b of barsOf(segments)) {
		const answer = chords[b.bar - 1];
		const chord = answer === undefined ? b.chord : answer.trim() === "" ? "N.C." : answer.trim();
		if (!sameChord(chord, b.chord)) changed++;
		const previous = out[out.length - 1];
		if (previous && previous.chord === chord && previous.bar + previous.bars === b.bar) {
			previous.bars += 1;
			previous.sum += b.confidence;
		} else
			out.push({ bar: b.bar, bars: 1, start: b.start, chord, confidence: 0, sum: b.confidence });
	}
	return {
		segments: out.map(({ sum, ...s }) => ({ ...s, confidence: sum / s.bars })),
		changed,
	};
}
