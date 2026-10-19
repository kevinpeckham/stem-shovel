import { secondsAtBar, type BarGrid } from "#lib/audio/measures.js";
import { formatTime } from "./formatTime";

/**
 * The Studio ruler's ticks (docs/multitrack-recorder.md, "The page"): on
 * the grid, a major tick per bar labeled every n bars so labels stay at
 * least 48 px apart, with minor ticks on the beats when they are 14 px
 * apart or more; in free time, a labeled tick every step of a ladder
 * chosen so ticks are at least 70 px apart. `x` is in pixels from the
 * timeline's start. With a tempo map (`map`, utils/studioGrid.ts) the
 * bars follow its changes (D5); without one the song's tempo and meter
 * hold throughout.
 */
export interface RulerTick {
	x: number;
	label: string | null;
	major: boolean;
}

const FREE_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

export function rulerTicks(view: {
	seconds: number;
	pxPerSecond: number;
	grid: { on: boolean; bpm: number; beatsPerBar: number; map?: BarGrid };
}): RulerTick[] {
	const { seconds, pxPerSecond, grid } = view;
	const out: RulerTick[] = [];
	if (grid.on && grid.map) {
		// Bar by bar along the map: each bar's own length decides its beat ticks and whether labels thin out.
		const map = grid.map;
		let every = 1;
		for (let b = 1; b < 100000; b++) {
			const at = secondsAtBar(map, b);
			if (at >= seconds) break;
			const next = secondsAtBar(map, b + 1);
			const barPx = (next - at) * pxPerSecond;
			if (b === 1) every = Math.max(1, Math.ceil(48 / barPx));
			out.push({
				x: at * pxPerSecond,
				label: (b - 1) % every === 0 ? String(b) : null,
				major: true,
			});
			const bpb = map.meters.findLast((m) => at >= m.start)?.beatsPerBar ?? grid.beatsPerBar;
			if (barPx / bpb >= 14)
				for (let k = 2; k <= bpb; k++)
					out.push({ x: secondsAtBar(map, b, k) * pxPerSecond, label: null, major: false });
		}
		return out;
	}
	if (grid.on) {
		const beat = 60 / grid.bpm;
		const bar = beat * grid.beatsPerBar;
		const beatPx = beat * pxPerSecond;
		const barPx = bar * pxPerSecond;
		const every = Math.max(1, Math.ceil(48 / barPx));
		const bars = Math.ceil(seconds / bar);
		for (let b = 0; b < bars; b++) {
			out.push({ x: b * barPx, label: b % every === 0 ? String(b + 1) : null, major: true });
			if (beatPx >= 14)
				for (let k = 1; k < grid.beatsPerBar; k++)
					out.push({ x: b * barPx + k * beatPx, label: null, major: false });
		}
		return out;
	}
	const step = FREE_STEPS.find((s) => s * pxPerSecond >= 70) ?? 600;
	for (let t = 0; t < seconds; t += step)
		out.push({ x: t * pxPerSecond, label: formatTime(t, step < 1 ? 1 : 0), major: true });
	return out;
}
