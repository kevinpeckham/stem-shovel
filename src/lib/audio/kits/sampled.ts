import { DRUM_VOICE_IDS, type DrumVoiceId } from "$lib/constants/drumMachine";
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

	/**
	 * A built-in kit reads static/kits/<id>; a custom kit (docs/drum-machine.md,
	 * "Custom kits") the URLs its manifest names, a voice without one staying
	 * silent; a built-in with `urls` is one whose admin replaced some drums,
	 * every other voice still its own file.
	 */
	constructor(
		readonly id: string,
		readonly urls: Partial<Record<DrumVoiceId, string>> | null = null,
		readonly builtin = false,
	) {}

	warm(): void {
		if (this.#files || typeof fetch === "undefined") return;
		this.#files = new Map();
		for (const voice of DRUM_VOICE_IDS) {
			const url =
				this.urls && !this.builtin
					? this.urls[voice]
					: (this.urls?.[voice] ?? `/kits/${this.id}/${voice}.wav`);
			if (!url) continue;
			this.#files.set(
				voice,
				fetch(url).then((r) => {
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
