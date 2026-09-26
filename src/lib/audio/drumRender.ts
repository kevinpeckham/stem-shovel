import { DRUM_HUMANIZE_MS } from "$lib/constants/drumMachine";
import { drumStepTime } from "$lib/utils/drumStepTime";
import { encodeWav } from "$lib/utils/encodeWav";
import type { DrumPattern, DrumProject } from "$lib/val/DrumPatternSchema";
import { drumKit } from "./kits";
import type { DrumHit, DrumKit } from "./kits/types";

/**
 * Playing one step of a pattern into a graph, shared by the live engine
 * and the offline render: each row that sounds gets a panner into `out`,
 * its level squared into a gain and the cell's velocity on top, humanize
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
	out: AudioNode,
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
		panner.connect(out);
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
	const master = ctx.createGain();
	master.gain.value = 0.9;
	master.connect(ctx.destination);
	const state: DrumPlayState = { openHat: null };
	for (let c = 0; c < cycles; c++) {
		for (let s = 0; s < pattern.steps; s++) {
			const at = c * cycle + drumStepTime(s, project.bpm, project.swing);
			playDrumStep(ctx, kit, master, project, pattern, s, at, state);
		}
	}
	const rendered = await ctx.startRendering();
	const from = Math.round(cycle * (cycles - 1) * sampleRate);
	const to = Math.round(cycle * cycles * sampleRate);
	const channels = [0, 1].map((ch) => rendered.getChannelData(ch).slice(from, to));
	return encodeWav(channels, sampleRate);
}
