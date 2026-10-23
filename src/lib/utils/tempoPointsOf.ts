import { secondsAtBar, barAt, tempoAt, type BarGrid } from "#lib/audio/measures.js";

/**
 * The tempo map as the points a DAW's lane takes (docs/multitrack-recorder.md
 * "Tempo ramps"): the song's tempo at zero, then each change, each point
 * saying whether the tempo runs linearly from it to the next (`linear`).
 * A ramp on `curve` is one such point pair; a ramp on the other curve is
 * laid down as a point at every bar line inside it, each linear to the
 * next, which follows the true curve to within a hair. A meter change
 * at a second gets a point too when `meters` are given (Reaper's lane
 * carries the time signature on its points), so the meter lands where it
 * should even inside a ramp.
 */
export function tempoPointsOf(
	grid: BarGrid,
	bpm: number,
	changes: { start: number; bpm: number; ramp?: "time" | "beats" }[],
	curve: "time" | "beats" = "beats",
	meters: { start: number }[] = [],
): { start: number; bpm: number; linear: boolean }[] {
	const sorted = [...changes].filter((c) => c.start > 0).sort((x, y) => x.start - y.start);
	const starts = new Set<number>([0, ...sorted.map((c) => c.start)]);
	for (const m of meters) if (m.start > 0) starts.add(m.start);
	// Bar lines inside a ramp of the other curve.
	let prev = 0;
	for (const c of sorted) {
		if (c.ramp && c.ramp !== curve) {
			let bar = barAt(grid, prev).bar + 1;
			for (let guard = 0; guard < 10000; guard++, bar++) {
				const t = secondsAtBar(grid, bar);
				if (t >= c.start - 1e-6) break;
				if (t > prev + 1e-6) starts.add(Math.round(t * 1e6) / 1e6);
			}
		}
		prev = c.start;
	}
	const times = [...starts].sort((x, y) => x - y);
	return times.map((t, i) => {
		const next = times[i + 1];
		// Linear to the next point when a ramp runs across the span to it.
		const ramp = next === undefined ? undefined : sorted.find((c) => c.start >= next && c.ramp);
		const rampFrom = ramp ? (sorted[sorted.indexOf(ramp) - 1]?.start ?? 0) : Infinity;
		const linear = ramp !== undefined && rampFrom <= t && ramp.bpm !== tempoAt(grid, rampFrom);
		return { start: t, bpm: round2(t === 0 ? bpm : tempoAt(grid, t)), linear };
	});
}

const round2 = (n: number) => Math.round(n * 100) / 100;
