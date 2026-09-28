import { DRUM_HUMANIZE_MS } from "$lib/constants/drumMachine";
import { drumStepTime } from "$lib/utils/drumStepTime";
import { encodeWav } from "$lib/utils/encodeWav";
import type { DrumPattern, DrumProject } from "$lib/val/DrumPatternSchema";
import { createDrumBus, type DrumBus } from "./drumBus";
import { drumKit } from "./kits";
import type { DrumHit, DrumKit } from "./kits/types";

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
	kit: DrumKit,
	bus: DrumBus,
	project: Pick<DrumProject, "humanize">,
	pattern: DrumPattern,
	step: number,
	at: number,
	state: DrumPlayState,
	solo: boolean[] = [],
	random: () => number = Math.random,
): void {
	const anySolo = solo.some(Boolean);
	pattern.rows.forEach((row, i) => {
		const velocity = row.cells[step] ?? 0;
		if (!velocity || row.mute || (anySolo && !solo[i])) return;
		const scatter = project.humanize;
		const when = Math.max(0, at + ((random() * 2 - 1) * scatter * DRUM_HUMANIZE_MS) / 1000);
		const gain =
			row.level * row.level * (VELOCITY_GAIN[velocity] ?? 1) * (1 - random() * scatter * 0.25);
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
		const hit = kit.play(row.voice, ctx, when, gain, panner);
		if (row.voice === "hat-open") state.openHat = hit;
	});
}

/**
 * A pattern rendered to WAV as one seamless cycle: the pattern is played
 * three times and the third taken, so hits ringing over the loop point
 * from the bar before are in the file the way they are in the room.
 */
export async function renderDrumPatternWav(
	project: DrumProject,
	pattern: DrumPattern,
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
			playDrumStep(ctx, kit, bus, project, pattern, s, at, state);
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
	project: DrumProject,
	bars: DrumPattern[],
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
			playDrumStep(ctx, kit, bus, project, bar, s, at, state);
		}
		start += drumStepTime(bar.steps, project.bpm, 0);
	}
	const rendered = await ctx.startRendering();
	const channels = [0, 1].map((ch) => rendered.getChannelData(ch));
	return encodeWav(channels, sampleRate);
}
