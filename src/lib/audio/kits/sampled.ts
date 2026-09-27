import { DRUM_VOICE_IDS, type DrumKitId, type DrumVoiceId } from "$lib/constants/drumMachine";
import type { DrumHit, DrumKit } from "./types";

/**
 * A kit of one-shot samples (static/kits/<id>/<voice>.wav; the acoustic
 * and room kits are Groovie's CC0 recordings, credited in the docs and on
 * /built-with). `warm` fetches the files ahead of the first touch (the
 * drum machine page calls it as it opens; the Idea Recorder waits for the
 * first play, so a page that never uses the drums never downloads them).
 * Decoding needs a context and so happens in `load`; the decoded buffers
 * serve any context after that, an offline one for the WAV export
 * included.
 */
export class SampledKit implements DrumKit {
	#files: Map<DrumVoiceId, Promise<ArrayBuffer>> | null = null;
	#buffers = new Map<DrumVoiceId, AudioBuffer>();
	#decoding: Promise<void> | null = null;

	constructor(readonly id: DrumKitId) {}

	warm(): void {
		if (this.#files || typeof fetch === "undefined") return;
		this.#files = new Map();
		for (const voice of DRUM_VOICE_IDS) {
			this.#files.set(
				voice,
				fetch(`/kits/${this.id}/${voice}.wav`).then((r) => {
					if (!r.ok) throw new Error(`${voice}: ${r.status}`);
					return r.arrayBuffer();
				}),
			);
		}
	}

	load(ctx: BaseAudioContext): Promise<void> {
		this.warm();
		this.#decoding ??= Promise.all(
			[...this.#files!].map(async ([voice, file]) => {
				// decodeAudioData detaches the buffer: decode a copy so the bytes stay whole.
				const bytes = (await file).slice(0);
				this.#buffers.set(voice, await ctx.decodeAudioData(bytes));
			}),
		).then(() => undefined);
		return this.#decoding;
	}

	play(
		voice: DrumVoiceId,
		ctx: BaseAudioContext,
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
