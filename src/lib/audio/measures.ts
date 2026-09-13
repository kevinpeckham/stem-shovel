import { formatTime } from "$lib/utils/formatTime";
import { formatTimecode } from "$lib/utils/formatTimecode";
import { parseBarsText } from "$lib/utils/parseBarsText";
import { parseTime } from "$lib/utils/parseTime";
import { parseTimecode } from "$lib/utils/parseTimecode";
import type { PositionMode } from "$lib/constants/positionModes";
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

/** Seconds at a bar position: the inverse of `barAt` (bars before the start run negative). */
export function secondsAtBar(grid: BarGrid, bar: number, beat = 1, fraction = 0): number {
	// Walk meter segments from the start to find which one holds the bar.
	const segs = grid.meters.filter((m) => m.start > grid.startAt).sort((a, b) => a.start - b.start);
	let segBar = 1;
	let segStart = grid.startAt;
	let bpb = valueAt(grid.meters, grid.startAt).beatsPerBar;
	for (const m of segs) {
		const barsIn = Math.ceil(beatsBetween(grid, segStart, m.start) / bpb - 1e-9);
		if (bar < segBar + barsIn) break;
		segBar += barsIn;
		segStart = m.start;
		bpb = m.beatsPerBar;
	}
	const beats = (bar - segBar) * bpb + (beat - 1) + fraction;
	return secondsAfterBeats(grid, segStart, beats);
}

/** Seconds reached after `beats` beats from `from`, through tempo changes (negative beats go backwards). */
function secondsAfterBeats(grid: BarGrid, from: number, beats: number): number {
	let t = from;
	let left = beats;
	const dir = beats >= 0 ? 1 : -1;
	for (let guard = 0; guard < 1000 && Math.abs(left) > 1e-9; guard++) {
		const bpm = valueAt(grid.tempos, dir > 0 ? t : t - 1e-9).bpm;
		const next =
			dir > 0
				? grid.tempos.map((x) => x.start).find((s) => s > t)
				: grid.tempos.map((x) => x.start).findLast((s) => s < t);
		const span = next === undefined ? Infinity : Math.abs(next - t);
		const beatsToNext = (span * bpm) / 60;
		if (Math.abs(left) <= beatsToNext) return t + (dir * Math.abs(left) * 60) / bpm;
		t += dir * span;
		left -= dir * beatsToNext;
	}
	return t;
}

/**
 * A position typed in any of the three formats → seconds. Digital time
 * ("1:23.4"), timecode ("01:23:15.72" — three or four colon groups) and bars
 * ("12|3", needs a grid). null when it is none of them.
 */
export function parsePosition(
	text: string,
	ctx: { fps: number; grid: BarGrid | null },
): number | null {
	const bars = parseBarsText(text);
	if (bars) return ctx.grid ? secondsAtBar(ctx.grid, bars.bar, bars.beat, bars.fraction) : null;
	const groups = text.trim().split(":").length;
	if (groups >= 3) return parseTimecode(text, ctx.fps);
	return parseTime(text);
}

/** A position in the given mode; bars fall back to time without a grid. */
export function formatPosition(
	mode: PositionMode,
	seconds: number,
	ctx: { fps: number; grid: BarGrid | null },
	opts: { precise?: boolean } = {},
): string {
	if (mode === "timecode") return formatTimecode(seconds, ctx.fps);
	if (mode === "bars" && ctx.grid) {
		// The readout shows whole beats; editors show the fraction too so it survives a round trip.
		const p = barAt(ctx.grid, seconds);
		const fraction = Math.round(p.fraction * 1000) / 1000;
		return `${p.bar}|${p.beat}${opts.precise && fraction > 0 && fraction < 1 ? `|${fraction}` : ""}`;
	}
	return formatTime(seconds, opts.precise ? 3 : 1);
}

/** "8 bars", "8 bars 2 beats" — a span's length in the meter in force where it starts. */
export function formatBarSpan(grid: BarGrid, from: number, to: number): string {
	const bpb = valueAt(grid.meters, from).beatsPerBar;
	const beats = Math.round(beatsBetween(grid, from, to) * 100) / 100;
	const bars = Math.floor(beats / bpb + 1e-9);
	const rest = Math.round((beats - bars * bpb) * 10) / 10;
	const parts = [];
	if (bars) parts.push(`${bars} ${bars === 1 ? "bar" : "bars"}`);
	if (rest) parts.push(`${rest} ${rest === 1 ? "beat" : "beats"}`);
	return parts.join(" ") || "0 bars";
}
