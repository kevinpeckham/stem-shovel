import { DRUM_VOICE_IDS, type DrumVoiceId } from "#lib/constants/drumMachine.js";
import type { DrumHit, DrumKit } from "./types";

/**
 * A multi-velocity, round-robin sampled kit for expression drums. Each voice
 * has up to 5 velocity layers (V1-V5) × 5 round-robin variants (RR1-RR5).
 * All files are fetched upfront in `warm`; only the active velocity layer
 * per voice is decoded into AudioBuffers. Switching velocity layers decodes
 * on demand (~1-5ms for short one-shots, well within the lookahead window).
 */
export class SampledKit implements DrumKit {
	/** Raw fetched bytes: voice → velocity (1-5) → RR promises. */
	#files: Map<DrumVoiceId, Map<number, Promise<ArrayBuffer | null>[]>> | null = null;
	/** Decoded audio: voice → velocity (1-5) → RR buffers. */
	#buffers = new Map<DrumVoiceId, Map<number, AudioBuffer[]>>();
	/** Round-robin index per voice: avoids repeating the last sample. */
	#lastRR = new Map<DrumVoiceId, number>();
	/** The active velocity layer per voice (1-5). */
	#velocityLayer = new Map<DrumVoiceId, number>();
	#decoding: Promise<void> | null = null;
	#ctx: BaseAudioContext | null = null;

	constructor(readonly id: string) {}

	/** Set the velocity layer for a voice (1-5). Triggers decode if needed. */
	setVelocityLayer(voice: DrumVoiceId, layer: number) {
		const clamped = Math.max(1, Math.min(5, Math.round(layer)));
		this.#velocityLayer.set(voice, clamped);
		void this.#decodeLayer(clamped);
	}

	/** The current velocity layer for a voice (defaults to 3). */
	getVelocityLayer(voice: DrumVoiceId): number {
		return this.#velocityLayer.get(voice) ?? 3;
	}

	warm(): void {
		if (this.#files || typeof fetch === "undefined") return;
		this.#files = new Map();
		for (const voice of DRUM_VOICE_IDS) {
			const layers = new Map<number, Promise<ArrayBuffer | null>[]>();
			for (let v = 1; v <= 5; v++) {
				const group: Promise<ArrayBuffer | null>[] = [];
				for (let rr = 1; rr <= 5; rr++) {
					const url = `/kits/${this.id}/${voice} V${v} RR${rr}.flac`;
					group.push(
						fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)),
					);
				}
				layers.set(v, group);
			}
			this.#files.set(voice, layers);
		}
	}

	load(ctx: BaseAudioContext): Promise<void> {
		this.warm();
		this.#ctx = ctx;
		this.#decoding ??= Promise.all([1, 2, 3, 4, 5].map((v) => this.#decodeLayer(v))).then(
			() => undefined,
		);
		return this.#decoding;
	}

	async #decodeLayer(v: number): Promise<void> {
		if (!this.#files || !this.#ctx) return;
		const promises = [...this.#files].map(async ([voice, layers]) => {
			if (this.#buffers.get(voice)?.has(v)) return;
			const group = layers.get(v);
			if (!group) return;
			const buffers: AudioBuffer[] = [];
			for (const file of group) {
				const bytes = await file;
				if (!bytes) continue;
				buffers.push(await this.#ctx!.decodeAudioData(bytes.slice(0)));
			}
			if (!this.#buffers.has(voice)) this.#buffers.set(voice, new Map());
			this.#buffers.get(voice)!.set(v, buffers);
		});
		await Promise.all(promises);
	}

	play(
		voice: DrumVoiceId,
		ctx: BaseAudioContext,
		at: number,
		gain: number,
		out: AudioNode,
		velocityLayer = 3,
	): DrumHit | null {
		const buffer = this.#rrSwitcher(voice, velocityLayer);
		// console.log("play:", voice, "V" + velocityLayer, "RR" + (this.#lastRR.get(voice) ?? "?"));
		if (!buffer) {
			void this.#decodeLayer(velocityLayer);
			return null;
		}
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

	#rrSwitcher(voice: DrumVoiceId, velocity: number): AudioBuffer | null {
		const layers = this.#buffers.get(voice);
		const buffers = layers?.get(velocity);
		if (!buffers || buffers.length === 0) return null;
		const last = this.#lastRR.get(voice) ?? -1;
		let pick: number;
		do {
			pick = Math.floor(Math.random() * buffers.length);
		} while (pick === last && buffers.length > 1);
		this.#lastRR.set(voice, pick);
		return buffers[pick];
	}
}
