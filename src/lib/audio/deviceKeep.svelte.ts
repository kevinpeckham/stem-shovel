import { mediaCache } from "#lib/audio/mediaCache.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { notify } from "#lib/state/notifications.svelte.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { STEM_RENDITION_BYTES_PER_SECOND } from "#lib/constants/studio.js";

/** The first load of a song waits this long at most to hear whether the song is kept. */
const KEPT_TIMEOUT_MS = 1000;

/**
 * The Stem Player's "keep on this device" (audio/mediaCache.ts,
 * KeepOnDevice.svelte): what this device keeps of the player's song, read
 * after every load, keep and removal (a replaced stem makes a kept copy
 * incomplete), and the keep and remove the line's links call. Nothing
 * happens without a song or a cache.
 */
export class DeviceKeep {
	kept = $state<{ bytes: number; complete: boolean; missing: number } | null>(null);
	#engine: StemEngine;
	#song: () => string | undefined;
	/** The song whose kept state was asked before its first load. */
	#askedFor: string | null = null;
	/** Loads begun, so a superseded one knows. */
	#loads = 0;

	constructor(engine: StemEngine, song: () => string | undefined) {
		this.#engine = engine;
		this.#song = song;
	}

	/** Whether the player offers it: a song, and a browser that can keep one. */
	get available(): boolean {
		return !!this.#song() && mediaCache.available;
	}

	/**
	 * Before the first load of a song: whether this device keeps it (1 s at
	 * most), so a kept song's load reads its stems from disk and keeps what
	 * it had to fetch. Null when there is nothing to ask, so a load that need
	 * not wait does not.
	 */
	beforeLoad(): Promise<void> | null {
		const song = this.#song();
		if (!song || !this.available || this.#askedFor === song) return null;
		this.#askedFor = song;
		return this.#engine.keptOnDevice(song, { timeoutMs: KEPT_TIMEOUT_MS }).then((found) => {
			this.#engine.keepSong = found ? song : null;
		});
	}

	/**
	 * A load of the player's stems (`run`, which starts it synchronously),
	 * after `beforeLoad` when there is something to ask, and the kept state
	 * read again once it is done. A later load supersedes one still waiting
	 * on the cache.
	 */
	async load(run: () => Promise<void>): Promise<void> {
		const token = ++this.#loads;
		const asking = this.beforeLoad();
		if (asking) {
			await asking;
			if (token !== this.#loads) return;
		}
		await run();
		if (token === this.#loads) await this.refresh();
	}

	/** The line's props for KeepOnDevice.svelte. */
	get props() {
		return {
			available: this.available,
			kept: this.kept,
			estimate: this.#engine.duration * this.#engine.stems.length * STEM_RENDITION_BYTES_PER_SECOND,
			keeping: this.#engine.keeping,
			onkeep: this.keep,
			onremove: this.remove,
		};
	}

	async refresh(): Promise<void> {
		const song = this.#song();
		this.kept = song && this.available ? await this.#engine.keptOnDevice(song) : null;
	}

	keep = async (): Promise<void> => {
		const song = this.#song();
		if (!song) return;
		try {
			const { bytes } = await this.#engine.keepOnDevice(song);
			notify(`Kept on this device (${formatBytes(bytes)})`);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
		await this.refresh();
	};

	remove = async (): Promise<void> => {
		const song = this.#song();
		if (!song) return;
		await this.#engine.forgetDevice(song);
		notify("Removed from this device");
		await this.refresh();
	};
}
