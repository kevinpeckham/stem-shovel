import { formatTimecode } from "#lib/utils/formatTimecode.js";
import { parseBarsText } from "#lib/utils/parseBarsText.js";
import { parseTime } from "#lib/utils/parseTime.js";
import { parseTimecode } from "#lib/utils/parseTimecode.js";
import type { PositionMode } from "#lib/constants/positionModes.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import type { TempoCurve } from "#lib/val/StudioSchema.js";

/**
 * Bars and beats from seconds. Tempo is beats per minute where a beat is the
 * meter's bottom number (6/8 at 120 = 120 eighth notes a minute), so a bar is
 * `top` beats long. Before the first tempo or meter change, that first value
 * applies. `startAt` is where bar 1 begins (leading silence, a count-in);
 * earlier positions count down through bar 0, -1, … as a DAW does. A tempo
 * with `ramp` is reached gradually from the one before it (Dawn's tempo
 * ramps, docs/multitrack-recorder.md): "time" has the tempo move linearly
 * with the seconds, "beats" linearly with the beats.
 */
export interface BarGrid {
	tempos: { start: number; bpm: number; ramp?: TempoCurve }[];
	meters: { start: number; beatsPerBar: number }[];
	startAt: number;
}

/**
 * One stretch of the tempo map: from `t0` at `b0` to `t1` (the next change,
 * or forever) at `b1`, holding `b0` throughout without a `curve`, else
 * moving to `b1`. On "time" the tempo is linear in seconds, so the beats
 * across a span are the mean tempo times its length; on "beats" the tempo
 * is linear in beats, which makes it exponential in seconds (the beat count
 * is the tempo's change over its log rate).
 */
interface TempoSegment {
	t0: number;
	b0: number;
	t1: number;
	b1: number;
	curve: TempoCurve | null;
}

const segmentOf = (grid: BarGrid, i: number): TempoSegment => {
	const a = grid.tempos[i]!;
	const n = grid.tempos[i + 1];
	const curve = n?.ramp && n.start > a.start && n.bpm !== a.bpm ? n.ramp : null;
	return { t0: a.start, b0: a.bpm, t1: n?.start ?? Infinity, b1: n?.bpm ?? a.bpm, curve };
};
/** The segment holding `t`: the last that starts at or before it (before the first, the first). Looking backward, a start exactly at `t` belongs to the segment before. */
const segmentAt = (grid: BarGrid, t: number, backward = false): TempoSegment => {
	const i = grid.tempos.findLastIndex((x) => (backward ? t > x.start : t >= x.start));
	return segmentOf(grid, Math.max(0, i));
};
/** The tempo at `t` within a segment. */
const bpmIn = (s: TempoSegment, t: number): number => {
	if (!s.curve || s.t1 === Infinity) return s.b0;
	const x = Math.max(0, Math.min(1, (t - s.t0) / (s.t1 - s.t0)));
	return s.curve === "time" ? s.b0 + (s.b1 - s.b0) * x : s.b0 * Math.pow(s.b1 / s.b0, x);
};
/** The log rate of a "beats" ramp: the tempo's growth per second. */
const rateOf = (s: TempoSegment) => Math.log(s.b1 / s.b0) / (s.t1 - s.t0);
/** Beats from `a` to `b`, both within the segment (a ≤ b). */
const beatsIn = (s: TempoSegment, a: number, b: number): number => {
	if (!s.curve || s.t1 === Infinity) return ((b - a) * s.b0) / 60;
	if (s.curve === "time") return (((bpmIn(s, a) + bpmIn(s, b)) / 2) * (b - a)) / 60;
	return (bpmIn(s, b) - bpmIn(s, a)) / (60 * rateOf(s));
};
/** Seconds from `from` that cover `beats` beats (signed), the span staying within the segment. */
const secondsIn = (s: TempoSegment, from: number, beats: number): number => {
	const here = bpmIn(s, from);
	if (!s.curve || s.t1 === Infinity) return (beats * 60) / here;
	if (s.curve === "time") {
		const slope = (s.b1 - s.b0) / (s.t1 - s.t0);
		// Beats over a span d at a tempo that climbs linearly: (here·d + slope·d²/2) / 60; solve for d.
		return (-here + Math.sqrt(here * here + 120 * slope * beats)) / slope;
	}
	const r = rateOf(s);
	return Math.log((here + 60 * r * beats) / here) / r;
};

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

/** Beats elapsed between two times, integrating the tempo in force across its changes and through its ramps. */
export function beatsBetween(grid: BarGrid, from: number, to: number): number {
	if (to < from) return -beatsBetween(grid, to, from);
	const cuts = [from, ...grid.tempos.map((t) => t.start).filter((s) => s > from && s < to), to];
	let beats = 0;
	for (let i = 1; i < cuts.length; i++)
		beats += beatsIn(segmentAt(grid, cuts[i - 1]!), cuts[i - 1]!, cuts[i]!);
	return beats;
}

/** Whether one tempo holds from `from` to `to`: no change starts between them and no ramp runs across. */
export function tempoSteadyAcross(grid: BarGrid, from: number, to: number): boolean {
	if (grid.tempos.some((t) => t.start > from && t.start < to)) return false;
	const s = segmentAt(grid, from);
	return !s.curve || from >= s.t1;
}

/** Beats of slack when a time sits on a beat line (a tenth of a millisecond at 400 bpm is 0.0007 of a beat). */
const BEAT_SLACK = 1e-3;

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
	// A thousandth of a beat of slack: a start is stored to a tenth of a millisecond (data.ts), coarser than
	// floating point, so an exact downbeat rounded down must not read as the last beat of the bar before.
	const whole = Math.floor(beats + BEAT_SLACK);
	const barsIn = Math.floor(whole / bpb);
	const beatIn = ((whole % bpb) + bpb) % bpb;
	return {
		bar: bar + barsIn,
		beat: beatIn + 1,
		fraction: Math.max(0, Math.min(1, beats - whole)),
	};
}

/** The tempo in force at `seconds` (the first, before any change; within a ramp, where the ramp has got to). */
export const tempoAt = (grid: BarGrid, seconds: number): number =>
	bpmIn(segmentAt(grid, seconds), seconds);
/** The beats to the bar in force at `seconds`. */
export const beatsPerBarAt = (grid: BarGrid, seconds: number): number =>
	valueAt(grid.meters, seconds).beatsPerBar;

/**
 * A count-in of `bars` before the stems start at `seconds` (the click,
 * stemClick.svelte.ts): the grid's beats leading up to the first beat line
 * at or after the playhead, so the count-in's "one" is the song's own and
 * the stems enter on it (from mid-bar, the stems come in before the "one"
 * as a pickup). Each beat says where it falls in song time (negative or
 * before the playhead for the ones that sound while the stems hold) and
 * how many beats are `left` to the entry (4, 3, 2, 1 for a bar of four:
 * the count counts down, Kevin). `hold` is how long the stems wait: the
 * time from the first count-in beat to the playhead. From before bar 1
 * (leading silence), the count leads into bar 1, so the beats between
 * the playhead and bar 1 sound while the stems play their silence.
 */
export function countInBeats(
	grid: BarGrid,
	seconds: number,
	bars: number,
): { beats: { at: number; left: number }[]; hold: number } {
	// Before bar 1 (leading silence), the entry is bar 1 itself: the count leads into the music, the
	// beats between the playhead and bar 1 falling in the silence as the stems already play.
	const entry =
		seconds < grid.startAt ? { at: grid.startAt, bar: 1, beat: 1 } : nextBeatAt(grid, seconds);
	const bpb = beatsPerBarAt(grid, seconds);
	const n = Math.max(0, Math.round(bars * bpb));
	const beats: { at: number; left: number }[] = [];
	for (let k = n; k >= 1; k--)
		beats.push({ at: secondsAtBar(grid, entry.bar, entry.beat - k), left: k });
	return { beats, hold: beats.length ? Math.max(0, seconds - beats[0]!.at) : 0 };
}

/** The first beat line at or after `seconds`: when it sounds, whether it opens a bar, and its bar and beat (the click, stemClick.svelte.ts). */
export function nextBeatAt(
	grid: BarGrid,
	seconds: number,
): { at: number; accent: boolean; bar: number; beat: number } {
	const pos = barAt(grid, seconds);
	// barAt's slack already rounds a hair before a beat line onto it (fraction 0), so that beat is the one.
	if (pos.fraction === 0)
		return {
			at: secondsAtBar(grid, pos.bar, pos.beat),
			accent: pos.beat === 1,
			bar: pos.bar,
			beat: pos.beat,
		};
	const bpb = valueAt(grid.meters, seconds).beatsPerBar;
	const bar = pos.beat >= bpb ? pos.bar + 1 : pos.bar;
	const beat = pos.beat >= bpb ? 1 : pos.beat + 1;
	return { at: secondsAtBar(grid, bar, beat), accent: beat === 1, bar, beat };
}

/**
 * `seconds` moved to the nearest bar line when one is within `maxBeats`
 * of it, else unchanged. For a time placed by ear (the AI's key changes,
 * sections and tempo shifts, docs/audio-engine.md "Snapped to the bar"):
 * a chord that comes in on the "and" of four is the next bar's, and a
 * timestamp a beat late is still this bar's. Before the start, unchanged.
 */
export function snapToDownbeat(grid: BarGrid, seconds: number, maxBeats = 1.5): number {
	if (seconds < grid.startAt) return seconds;
	const pos = barAt(grid, seconds);
	const into = pos.beat - 1 + pos.fraction;
	const bpb = valueAt(grid.meters, seconds).beatsPerBar;
	const toNext = bpb - into;
	if (into <= toNext && into <= maxBeats) return secondsAtBar(grid, pos.bar);
	if (toNext < into && toNext <= maxBeats) return secondsAtBar(grid, pos.bar + 1);
	return seconds;
}

/** The length in seconds of the bar `seconds` falls in. */
export function barSecondsAt(grid: BarGrid, seconds: number): number {
	const { bar } = barAt(grid, seconds);
	return secondsAtBar(grid, bar + 1) - secondsAtBar(grid, bar);
}

/**
 * `seconds` moved onto the nearest of `anchors` within `within` seconds,
 * else unchanged: a key change lands on the section that begins beside it,
 * a section on the key change (docs/audio-engine.md, "Snapped to the bar").
 */
export function snapToAnchor(seconds: number, anchors: number[], within: number): number {
	let best = seconds;
	let gap = within;
	for (const a of anchors) {
		const d = Math.abs(a - seconds);
		if (d <= gap) {
			gap = d;
			best = a;
		}
	}
	return best;
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

/** Seconds reached after `beats` beats from `from`, through tempo changes and ramps (negative beats go backwards). */
export function secondsAfterBeats(grid: BarGrid, from: number, beats: number): number {
	let t = from;
	let left = beats;
	const dir = beats >= 0 ? 1 : -1;
	for (let guard = 0; guard < 1000 && Math.abs(left) > 1e-9; guard++) {
		const seg = segmentAt(grid, t, dir < 0);
		const next = dir > 0 ? seg.t1 : seg.t0 < t ? seg.t0 : -Infinity;
		const span = Math.abs(next) === Infinity ? Infinity : Math.abs(next - t);
		const beatsToNext =
			span === Infinity ? Infinity : dir > 0 ? beatsIn(seg, t, next) : beatsIn(seg, next, t);
		if (Math.abs(left) <= beatsToNext) return t + secondsIn(seg, t, left);
		t = next;
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

/** A position in the given mode; bars fall back to timecode without a grid. */
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
		return `${p.bar} | ${p.beat}${opts.precise && fraction > 0 && fraction < 1 ? ` | ${fraction}` : ""}`;
	}
	// Bars without a grid: timecode.
	return formatTimecode(seconds, ctx.fps);
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
