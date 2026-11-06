import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { metronome as defaultMetronome } from "#lib/audio/metronome.svelte.js";

/** What the count-in uses of the metronome (the singleton, or a stand-in in a test). */
interface CountInMetronome {
	load(): void;
	start(): Promise<void>;
	stop(): void;
	bpm: number;
	beatsPerBar: number;
}

/** What the page supplies, as functions: SvelteKit reuses the page between songs. */
interface SongAmpOptions {
	/** The Stem Player's engine, the stems the amp plays along with. */
	engine: () => StemEngine | null;
	/** The metronome that counts in; the app's own by default. */
	metronome?: CountInMetronome;
}

/**
 * The song page's practice amp panel and the play-along transport in its
 * header (docs/practice-amp.md, "The band"): the stems from the top or where
 * they are, with a bar of clicks first when Count in is on (the metronome,
 * which the amp hosts), so the song and the guitar arrive together.
 */
export class SongAmp {
	/** The panel is open (the header's button toggles it). */
	open = $state(false);
	/** Play counts in with a bar of clicks first. */
	countIn = $state(true);
	/** The count-in bar is clicking; the song starts when it ends. */
	countingIn = $state(false);
	#countTimer: ReturnType<typeof setTimeout> | null = null;
	#engine: () => StemEngine | null;
	#metronome: CountInMetronome;

	constructor(opts: SongAmpOptions) {
		this.#engine = opts.engine;
		this.#metronome = opts.metronome ?? defaultMetronome;
	}

	/** The header's button: open or close the panel. */
	toggle() {
		this.open = !this.open;
	}

	/** Play (or pause, when playing and not from the start), from the top when `fromStart`, after the count-in when it is on. */
	async play(fromStart: boolean) {
		const engine = this.#engine();
		if (!engine || engine.status !== "ready") return;
		if (engine.playing && !fromStart) {
			engine.pause();
			return;
		}
		if (fromStart) engine.seek(0);
		if (!this.countIn) {
			await engine.play();
			return;
		}
		const metronome = this.#metronome;
		if (this.#countTimer) clearTimeout(this.#countTimer);
		metronome.load();
		this.countingIn = true;
		await metronome.start();
		const bar = (60 / metronome.bpm) * metronome.beatsPerBar;
		this.#countTimer = setTimeout(() => {
			metronome.stop();
			this.countingIn = false;
			this.#countTimer = null;
			void engine.play();
		}, bar * 1000);
	}

	/** Stop the count-in, if any, and pause the song. */
	stop() {
		this.#clearCountIn();
		this.#engine()?.pause();
	}

	/** When the page goes: the count-in's timer and clicks stop (the page turns the amp off itself). */
	dispose() {
		this.#clearCountIn();
	}

	#clearCountIn() {
		if (this.#countTimer) clearTimeout(this.#countTimer);
		this.#countTimer = null;
		if (this.countingIn) this.#metronome.stop();
		this.countingIn = false;
	}
}
