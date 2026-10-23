/**
 * A DAW's tempo lane in beats as Dawn's tempo map in seconds (docs/multitrack-recorder.md
 * "Tempo ramps"): `points` by beat, each with its tempo and whether the
 * tempo ramps from it to the next point (linearly over the beats, as a
 * DAWproject's and Live's lanes interpolate). The first entry is the
 * song's own tempo at zero; each later one a change at its second, a ramp
 * kept as a "beats" curve. A point that repeats the tempo before it is
 * dropped unless a ramp leaves from it (the ramp needs its start). Two
 * points on one beat are a jump: the later one counts, and the stretch
 * before them is taken as held (a ramp that ends in a jump is more than
 * one change at a second can say).
 */
export function tempoPointsToSeconds(
	points: { beat: number; bpm: number; ramp?: boolean }[],
): { start: number; bpm: number; ramp?: "beats" }[] {
	const sorted = [...points].sort((a, b) => a.beat - b.beat);
	const kept: { beat: number; bpm: number; ramp?: boolean }[] = [];
	for (const p of sorted) {
		const last = kept[kept.length - 1];
		if (last && p.beat === last.beat) {
			kept[kept.length - 1] = p;
			const before = kept[kept.length - 2];
			if (before) before.ramp = false;
		} else kept.push({ ...p });
	}
	const out: { start: number; bpm: number; ramp?: "beats" }[] = [];
	let t = 0;
	let prev: { beat: number; bpm: number; ramp?: boolean } | undefined;
	for (let i = 0; i < kept.length; i++) {
		const p = kept[i]!;
		if (prev) {
			const beats = p.beat - prev.beat;
			const ramps = prev.ramp === true && p.bpm !== prev.bpm;
			// A ramp's seconds: the beats over the log mean of the two tempos; a step's over the tempo held.
			t += ramps
				? (60 * beats * Math.log(p.bpm / prev.bpm)) / (p.bpm - prev.bpm)
				: (60 * beats) / prev.bpm;
			const next = kept[i + 1];
			const same = p.bpm === prev.bpm && !ramps;
			const starts = p.ramp === true && next !== undefined && next.bpm !== p.bpm;
			if (same && !starts) {
				prev = { ...p, ramp: false };
				continue;
			}
			out.push({ start: round6(t), bpm: p.bpm, ...(ramps ? { ramp: "beats" } : {}) });
		} else out.push({ start: 0, bpm: p.bpm });
		prev = p;
	}
	return out.length ? out : [{ start: 0, bpm: 120 }];
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
