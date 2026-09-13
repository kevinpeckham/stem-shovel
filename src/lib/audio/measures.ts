import type { SongChange } from "$lib/val/SongChangeSchema";

/**
 * Bars and beats from seconds. Tempo is beats per minute where a beat is the
 * meter's bottom number (6/8 at 120 = 120 eighth notes a minute), so a bar is
 * `top` beats long. Before the first tempo or meter change, that first value
 * applies. `startAt` is where bar 1 begins (leading silence, a count-in);
 * earlier positions count down through bar 0, -1, … as a DAW does.
 */
export interface BarGrid {
	tempos: { start: number; bpm: number }[];
	meters: { start: number; beatsPerBar: number }[];
	startAt: number;
}

/** A grid needs at least one tempo and one meter; null otherwise. */
export function barGrid(changes: SongChange[], startAt: number | null): BarGrid | null {
	const tempos = changes
		.filter((c) => c.kind === "tempo")
		.map((c) => ({ start: c.start, bpm: Number(c.value) }))
		.filter((t) => Number.isFinite(t.bpm) && t.bpm > 0);
	const meters = changes
		.filter((c) => c.kind === "meter")
		.map((c) => ({ start: c.start, beatsPerBar: Number(c.value.split("/")[0]) }))
		.filter((m) => Number.isFinite(m.beatsPerBar) && m.beatsPerBar > 0);
	if (tempos.length === 0 || meters.length === 0) return null;
	return { tempos, meters, startAt: startAt ?? 0 };
}

const valueAt = <T extends { start: number }>(list: T[], t: number) =>
	list.findLast((x) => t >= x.start) ?? list[0];

/** Beats elapsed between two times, integrating the tempo in force across its changes. */
function beatsBetween(grid: BarGrid, from: number, to: number): number {
	if (to < from) return -beatsBetween(grid, to, from);
	const cuts = [from, ...grid.tempos.map((t) => t.start).filter((s) => s > from && s < to), to];
	let beats = 0;
	for (let i = 1; i < cuts.length; i++) {
		beats += ((cuts[i] - cuts[i - 1]) * valueAt(grid.tempos, cuts[i - 1]).bpm) / 60;
	}
	return beats;
}

export interface BarPosition {
	bar: number; // 1 at startAt; 0, -1, … before it
	beat: number; // 1 … beatsPerBar
	fraction: number; // 0 … 1 through the beat
}

/**
 * Bar and beat at `seconds`. Meter changes reset the bar count at their own
 * time (a change lands on a bar line in practice), so bars are counted per
 * meter segment from the bar the change fell on.
 */
export function barAt(grid: BarGrid, seconds: number): BarPosition {
	// Meter segments from startAt forward; before startAt, the first meter and negative beats.
	const segs = grid.meters.filter((m) => m.start > grid.startAt).sort((a, b) => a.start - b.start);
	let bar = 1;
	let segStart = grid.startAt;
	let bpb = valueAt(grid.meters, grid.startAt).beatsPerBar;
	for (const m of segs) {
		if (seconds < m.start) break;
		bar += Math.ceil(beatsBetween(grid, segStart, m.start) / bpb - 1e-9);
		segStart = m.start;
		bpb = m.beatsPerBar;
	}
	const beats = beatsBetween(grid, segStart, seconds);
	const whole = Math.floor(beats + 1e-9);
	const barsIn = Math.floor(whole / bpb);
	const beatIn = ((whole % bpb) + bpb) % bpb;
	return {
		bar: bar + barsIn,
		beat: beatIn + 1,
		fraction: Math.max(0, Math.min(1, beats - whole)),
	};
}

/** "12.3" — bar.beat, the DAW convention. */
export function formatBars(p: BarPosition): string {
	return `${p.bar}.${p.beat}`;
}
