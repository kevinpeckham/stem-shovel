import { nextBeatAt, tempoAt, type BarGrid } from "#lib/audio/measures.js";

/**
 * The tempo map as steps, for a file whose tempo only steps (a MIDI
 * file's): each change at its second, and a ramp as the tempo at every
 * beat line inside it, its own point last (docs/multitrack-recorder.md
 * "Tempo ramps"). The song's own tempo at zero is not among them.
 */
export function tempoStepsOf(
	grid: BarGrid,
	changes: { start: number; bpm: number; ramp?: "time" | "beats" }[],
): { start: number; bpm: number }[] {
	const sorted = [...changes].filter((c) => c.start > 0).sort((x, y) => x.start - y.start);
	const out: { start: number; bpm: number }[] = [];
	sorted.forEach((c, i) => {
		if (c.ramp) {
			const from = i ? sorted[i - 1]!.start : 0;
			let t = nextBeatAt(grid, from + 0.0005).at;
			for (let guard = 0; guard < 10000 && t < c.start - 0.0005; guard++) {
				out.push({ start: round4(t), bpm: Math.round(tempoAt(grid, t) * 100) / 100 });
				t = nextBeatAt(grid, t + 0.0005).at;
			}
		}
		out.push({ start: c.start, bpm: c.bpm });
	});
	return out;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
