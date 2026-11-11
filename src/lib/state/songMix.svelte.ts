import type { StemEngine } from "#lib/audio/engine.svelte.js";

/** What the page supplies, as functions since its data changes between songs. */
export interface SongMixOptions {
	/** The song's stems with their saved default mix (`data.manifest`). */
	manifest: () => {
		stems: { id: string; gain?: number | null; pan?: number | null; muted?: boolean | null }[];
	};
	/** The stem player's engine, once it mounts. */
	engine: () => StemEngine | null;
}

/** The listener's mix against the song's default: what the actions menu offers to reset or save. */
export class SongMix {
	#opts: SongMixOptions;
	/** The song's default mix per stem; the faders start here for everyone. */
	defaultGains = $derived.by(
		() => new Map(this.#opts.manifest().stems.map((s) => [s.id, s.gain ?? 1])),
	);
	defaultPans = $derived.by(
		() => new Map(this.#opts.manifest().stems.map((s) => [s.id, s.pan ?? 0])),
	);
	/** The stems the default mix starts muted. */
	defaultMuted = $derived.by(
		() => new Set(this.#opts.manifest().stems.flatMap((s) => (s.muted ? [s.id] : []))),
	);
	/** The listener moved something (fader, pan, mute, solo or master) away from the default mix. */
	#dirty = $derived.by(() => {
		const engine = this.#opts.engine();
		return (
			!!engine && (engine.master !== 1 || engine.stems.some((s) => s.soloed || this.#savable(s)))
		);
	});
	/** The faders, pans and mutes differ from the default: there is a new default to save (solo and the master are the listener's own). */
	#fadersDirty = $derived.by(() => {
		const engine = this.#opts.engine();
		return !!engine && engine.stems.some(this.#savable);
	});

	constructor(opts: SongMixOptions) {
		this.#opts = opts;
	}

	/** A stem's fader or pan sits away from the song's default mix. */
	stemDirty = (s: { id: string; gain: number; pan: number }) =>
		Math.abs(s.gain - (this.defaultGains.get(s.id) ?? 1)) > 1e-6 ||
		Math.abs(s.pan - (this.defaultPans.get(s.id) ?? 0)) > 1e-6;

	/** A stem's mute differs from the default mix's. */
	muteDirty = (s: { id: string; muted: boolean }) => s.muted !== this.defaultMuted.has(s.id);

	#savable = (s: { id: string; gain: number; pan: number; muted: boolean }) =>
		this.stemDirty(s) || this.muteDirty(s);

	get dirty() {
		return this.#dirty;
	}

	get fadersDirty() {
		return this.#fadersDirty;
	}
}
