import { DRUM_VOICE_IDS, type DrumVoiceId } from "$lib/constants/drumMachine";
import type { DrumHit, DrumKit } from "./types";

/**
 * The acoustic kit: one-shot samples from Groovie's CC0 library
 * (static/kits/acoustic/<voice>.wav, credited on /built-with). The files
 * are fetched as soon as the kit is made, so they are usually here by the
 * first touch, and decoded then, since iOS refuses an AudioContext made
 * before a touch.
 */
export class AcousticKit implements DrumKit {
	readonly id = "acoustic" as const;
	#files = new Map<DrumVoiceId, Promise<ArrayBuffer>>();
	#buffers = new Map<DrumVoiceId, AudioBuffer>();
	#decoded: AudioContext | null = null;

	constructor() {
		if (typeof fetch === "undefined") return;
		for (const voice of DRUM_VOICE_IDS) {
			this.#files.set(
				voice,
				fetch(`/kits/acoustic/${voice}.wav`).then((r) => {
					if (!r.ok) throw new Error(`${voice}: ${r.status}`);
					return r.arrayBuffer();
				}),
			);
		}
	}

	async load(ctx: AudioContext): Promise<void> {
		if (this.#decoded === ctx) return;
		this.#decoded = ctx;
		await Promise.all(
			[...this.#files].map(async ([voice, file]) => {
				// decodeAudioData detaches the buffer: decode a copy so a second context can too.
				const bytes = (await file).slice(0);
				this.#buffers.set(voice, await ctx.decodeAudioData(bytes));
			}),
		);
	}

	play(
		voice: DrumVoiceId,
		ctx: AudioContext,
		at: number,
		gain: number,
		out: AudioNode,
	): DrumHit | null {
		const buffer = this.#buffers.get(voice);
		if (!buffer) return null;
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const g = ctx.createGain();
		g.gain.value = gain;
		source.connect(g).connect(out);
		source.start(at);
		return {
			stop(t) {
				g.gain.setTargetAtTime(0, t, 0.01);
				source.stop(t + 0.05);
			},
		};
	}
}
