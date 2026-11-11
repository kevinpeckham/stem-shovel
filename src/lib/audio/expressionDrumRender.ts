import { DRUM_HUMANIZE_MS } from "#lib/constants/drumMachine.js";
import { drumStepTime } from "#lib/utils/drumStepTime.js";
import { encodeWav } from "#lib/utils/encodeWav.js";
import type { ExpressionPattern, ExpressionProject, ExpressionRow } from "#lib/val/ExpressionDrumSchema.js";
import { cellActive } from "#lib/val/ExpressionDrumSchema.js";
import { createDrumBus, type DrumBus } from "./drumBus";
import { drumKit } from "./kits/expressionIndex";
import type { DrumHit } from "./kits/types";
import type { SampledKit as ExpressionKit } from "./kits/expressionSampled";

/**
 * Playing one step of a pattern into the bus, shared by the live engine
 * and the offline render: each row that sounds gets a panner into the dry
 * input and, by its sends, into the delay and the reverb, its level
 * squared into a gain and the cell's velocity on top, humanize
 * scattering the hit a little in time and level, and a closed hat choking
 * an open one still ringing. `state` carries the ringing open hat between
 * steps.
 */

/** Gain per velocity: silent, ghost, normal, accent. */
const VELOCITY_GAIN = [0, 0.45, 0.85, 1];

export interface DrumPlayState {
	openHat: DrumHit | null;
}

export function playDrumStep(
	ctx: BaseAudioContext,
	kit: ExpressionKit,
	bus: DrumBus,
	project: Pick<ExpressionProject, "humanize" | "bpm" | "swing" | "swingGrid">,
	pattern: ExpressionPattern,
	step: number,
	at: number,
	stepDuration: number,
	state: DrumPlayState,
	solo: boolean[] = [],
	random: () => number = Math.random,
): void {
	const anySolo = solo.some(Boolean);
	pattern.rows.forEach((row, i) => {
		const cell = row.cells[step];
		if (!cell || !cellActive(cell) || row.mute || (anySolo && !solo[i])) return;
		if (cell.t1 || cell.half || cell.t2) console.log("sub-hits on step", step, row.voice, { t1: cell.t1, half: cell.half, t2: cell.t2, stepDuration });
		const scatter = project.humanize;

		// Main hit (on the grid)
		if (cell.main) {
			const when = Math.max(0, at + ((random() * 2 - 1) * scatter * DRUM_HUMANIZE_MS) / 1000);
			const gain = 1 - random() * scatter * 0.25;
			playDrumHit(ctx, kit, bus, row, gain, when, state, cell.main);
		}
		// First triplet (1/3 of step after)
		if (cell.t1) {
			const when = Math.max(0, at + stepDuration / 3 + ((random() * 2 - 1) * scatter * DRUM_HUMANIZE_MS) / 1000);
			const gain = 1 - random() * scatter * 0.25;
			playDrumHit(ctx, kit, bus, row, gain, when, state, cell.t1);
		}
		// Even split (1/2 of step after)
		if (cell.half) {
			const when = Math.max(0, at + stepDuration / 2 + ((random() * 2 - 1) * scatter * DRUM_HUMANIZE_MS) / 1000);
			const gain = 1 - random() * scatter * 0.25;
			playDrumHit(ctx, kit, bus, row, gain, when, state, cell.half);
		}
		// Second triplet (2/3 of step after)
		if (cell.t2) {
			const when = Math.max(0, at + stepDuration * 2 / 3 + ((random() * 2 - 1) * scatter * DRUM_HUMANIZE_MS) / 1000);
			const gain = 1 - random() * scatter * 0.25;
			playDrumHit(ctx, kit, bus, row, gain, when, state, cell.t2);
		}
	});
}

/**
 * One hit of a row's voice into the bus at `gain` (the row's level
 * squared on top), through a panner into the dry input and, by the row's
 * sends, into the delay and the reverb; a closed hat chokes an open one
 * still ringing. The step player and a pad's MIDI hit share it.
 */
export function playDrumHit(
	ctx: BaseAudioContext,
	kit: ExpressionKit,
	bus: DrumBus,
	row: Pick<ExpressionRow, "voice" | "level" | "pan" | "delaySend" | "reverbSend">,
	gain: number,
	when: number,
	state: DrumPlayState,
	velocityLayer = 3,
): DrumHit | null {
	const panner = ctx.createStereoPanner();
	panner.pan.value = row.pan;
	panner.connect(bus.dry);
	for (const [send, input] of [
		[row.delaySend, bus.delay],
		[row.reverbSend, bus.reverb],
	] as const) {
		if (send <= 0) continue;
		const g = ctx.createGain();
		g.gain.value = send;
		panner.connect(g).connect(input);
	}
	if (row.voice === "hat-closed") state.openHat?.stop(when);
	const hit = kit.play(row.voice, ctx, when, row.level * row.level * gain, panner, velocityLayer);
	if (row.voice === "hat-open") state.openHat = hit;
	return hit;
}

/**
 * A pattern rendered to WAV as one seamless cycle: the pattern is played
 * three times and the third taken, so hits ringing over the loop point
 * from the bar before are in the file the way they are in the room.
 */
export async function renderDrumPatternWav(
	project: ExpressionProject,
	pattern: ExpressionPattern,
	sampleRate = 44100,
): Promise<Blob> {
	const kit = drumKit(project.kit);
	const cycle = drumStepTime(pattern.steps, project.bpm, 0);
	const cycles = 3;
	const ctx = new OfflineAudioContext(2, Math.ceil(cycle * cycles * sampleRate), sampleRate);
	await kit.load(ctx);
	const bus = createDrumBus(ctx, project.fx, project.bpm);
	const state: DrumPlayState = { openHat: null };
	for (let c = 0; c < cycles; c++) {
		for (let s = 0; s < pattern.steps; s++) {
			const at = c * cycle + drumStepTime(s, project.bpm, project.swing, project.swingGrid);
			const nextAt = s + 1 < pattern.steps
				? c * cycle + drumStepTime(s + 1, project.bpm, project.swing, project.swingGrid)
				: c * cycle + cycle;
			playDrumStep(ctx, kit, bus, project, pattern, s, at, nextAt - at, state);
		}
	}
	const rendered = await ctx.startRendering();
	const from = Math.round(cycle * (cycles - 1) * sampleRate);
	const to = Math.round(cycle * cycles * sampleRate);
	const channels = [0, 1].map((ch) => rendered.getChannelData(ch).slice(from, to));
	return encodeWav(channels, sampleRate);
}

/** Seconds of delay and reverb left ringing after a song's last bar. */
const SONG_TAIL_S = 2;

/**
 * A song, bar after bar (the timeline's patterns in order), once through
 * with the effects ringing out for a moment at the end: not a loop, a
 * take. Rendered as the live engine plays it, cycle by cycle.
 */
export async function renderDrumSongWav(
	project: ExpressionProject,
	bars: ExpressionPattern[],
	sampleRate = 44100,
): Promise<Blob> {
	const kit = drumKit(project.kit);
	const length = bars.reduce((sum, b) => sum + drumStepTime(b.steps, project.bpm, 0), 0);
	const ctx = new OfflineAudioContext(
		2,
		Math.ceil((length + SONG_TAIL_S) * sampleRate),
		sampleRate,
	);
	await kit.load(ctx);
	const bus = createDrumBus(ctx, project.fx, project.bpm);
	const state: DrumPlayState = { openHat: null };
	let start = 0;
	for (const bar of bars) {
		for (let s = 0; s < bar.steps; s++) {
			const at = start + drumStepTime(s, project.bpm, project.swing, project.swingGrid);
			const nextAt = s + 1 < bar.steps
				? start + drumStepTime(s + 1, project.bpm, project.swing, project.swingGrid)
				: start + drumStepTime(bar.steps, project.bpm, 0);
			playDrumStep(ctx, kit, bus, project, bar, s, at, nextAt - at, state);
		}
		start += drumStepTime(bar.steps, project.bpm, 0);
	}
	const rendered = await ctx.startRendering();
	const channels = [0, 1].map((ch) => rendered.getChannelData(ch));
	return encodeWav(channels, sampleRate);
}
