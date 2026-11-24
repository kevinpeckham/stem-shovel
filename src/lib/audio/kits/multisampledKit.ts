import type { DrumKitLayer, MultisampledKitSample } from "#lib/constants/drumKits.js";
import type { DrumVoiceId } from "#lib/constants/drumMachine.js";
import { velocityLayerPlan, type LayerPlan } from "#lib/utils/velocityLayerPlan.js";
import type { DrumHit, LayeredDrumKit } from "./types";

/** A kit's files as expression drums loads them: per voice, each with its layer, round robin, URL and loudness. */
export type MultisampledKitFiles = Partial<Record<DrumVoiceId, MultisampledKitSample[]>>;

/**
 * A multisampled kit: velocity layers × round robins per voice
 * (docs/drum-machine.md, "Multisampled kits"). It plays exactly the files it is
 * given (the built-in kit's list, or a custom kit's rows); nothing is
 * guessed. Each voice's layer plan (velocityLayerPlan) says what a velocity
 * plays: its own layer's samples, or a louder layer's attenuated, never
 * boosted. A voice with no V5 file is silent. All files are fetched in
 * `warm` and decoded in `load`; one-shots are small.
 */
export class MultisampledKit implements LayeredDrumKit {
	/** Fetched bytes: voice → layer → one promise per file. */
	#files: Map<DrumVoiceId, Map<DrumKitLayer, Promise<ArrayBuffer | null>[]>> | null = null;
	/** Decoded audio: voice → layer → buffers (only the files that decoded). */
	#buffers = new Map<DrumVoiceId, Map<DrumKitLayer, AudioBuffer[]>>();
	/** Per voice: which layer each velocity plays and how much it is cut. */
	readonly plans = new Map<DrumVoiceId, LayerPlan>();
	/** The last round robin per voice and layer, so a hit never repeats the one before it. */
	#lastRR = new Map<string, number>();
	#decoding: Promise<void> | null = null;

	constructor(
		readonly id: string,
		readonly files: MultisampledKitFiles,
	) {
		for (const [voice, list] of Object.entries(files) as [DrumVoiceId, MultisampledKitSample[]][]) {
			const loudest: Partial<Record<DrumKitLayer, number | null>> = {};
			for (const s of list) {
				const was = loudest[s.layer];
				const now = s.loudness !== null && Number.isFinite(s.loudness) ? s.loudness : null;
				// The loudest measured file speaks for the layer; a layer with none measured is null.
				loudest[s.layer] = was === undefined ? now : now === null ? was : was === null ? now : Math.max(was, now);
			}
			const plan = velocityLayerPlan(loudest);
			if (plan) this.plans.set(voice, plan);
		}
	}

	warm(): void {
		if (this.#files || typeof fetch === "undefined") return;
		this.#files = new Map();
		for (const [voice, list] of Object.entries(this.files) as [DrumVoiceId, MultisampledKitSample[]][]) {
			if (!this.plans.has(voice)) continue; // no V5: never played
			const layers = new Map<DrumKitLayer, Promise<ArrayBuffer | null>[]>();
			for (const s of list) {
				const group = layers.get(s.layer) ?? [];
				group.push(
					fetch(s.url)
						.then((r) => (r.ok ? r.arrayBuffer() : null))
						.catch(() => null),
				);
				layers.set(s.layer, group);
			}
			this.#files.set(voice, layers);
		}
	}

	load(ctx: BaseAudioContext): Promise<void> {
		this.warm();
		this.#decoding ??= this.#decodeAll(ctx);
		return this.#decoding;
	}

	async #decodeAll(ctx: BaseAudioContext): Promise<void> {
		if (!this.#files) return;
		const jobs: Promise<void>[] = [];
		for (const [voice, layers] of this.#files) {
			const decoded = new Map<DrumKitLayer, AudioBuffer[]>();
			this.#buffers.set(voice, decoded);
			for (const [layer, group] of layers) {
				jobs.push(
					(async () => {
						const buffers: AudioBuffer[] = [];
						for (const file of group) {
							const bytes = await file;
							if (!bytes) continue;
							try {
								buffers.push(await ctx.decodeAudioData(bytes.slice(0)));
							} catch {
								// A file the browser cannot decode is left out; the layer plays what remains.
							}
						}
						decoded.set(layer, buffers);
					})(),
				);
			}
		}
		await Promise.all(jobs);
	}

	play(
		voice: DrumVoiceId,
		ctx: BaseAudioContext,
		at: number,
		gain: number,
		out: AudioNode,
		velocityLayer = 3,
	): DrumHit | null {
		const plan = this.plans.get(voice);
		if (!plan) return null;
		const layer = Math.max(1, Math.min(5, Math.round(velocityLayer))) as DrumKitLayer;
		const { source, attenuationDb } = plan[layer];
		const buffer = this.#pick(voice, source);
		if (!buffer) return null;
		const node = ctx.createBufferSource();
		node.buffer = buffer;
		const g = ctx.createGain();
		g.gain.value = gain * 10 ** (-attenuationDb / 20);
		node.connect(g).connect(out);
		node.start(at);
		return {
			stop(t) {
				g.gain.setTargetAtTime(0, t, 0.01);
				node.stop(t + 0.05);
			},
		};
	}

	/** A round robin of the layer at random, never the one played last from it. */
	#pick(voice: DrumVoiceId, layer: DrumKitLayer): AudioBuffer | null {
		const buffers = this.#buffers.get(voice)?.get(layer);
		if (!buffers || buffers.length === 0) return null;
		const key = `${voice}:${layer}`;
		const last = this.#lastRR.get(key) ?? -1;
		let pick: number;
		do {
			pick = Math.floor(Math.random() * buffers.length);
		} while (pick === last && buffers.length > 1);
		this.#lastRR.set(key, pick);
		return buffers[pick] ?? null;
	}
}
