import type { SongStage } from "#lib/val/SongStageSchema.js";
import type { PanelMode } from "./songDocs.svelte.js";

/** What the player's box shows: the stems, the demos or the mixes. */
export type PlayerView = "stems" | "demos" | "mixes";

/** Something that plays and can be paused (the stem engine, the demo panel). */
interface Pausable {
	pause(): void;
}

/** What the page supplies, as functions since its data changes between songs. */
export interface SongPlayerLayoutOptions {
	/** The song's stage (the page's `stage`, songStage). */
	stage: () => SongStage;
	/** The song's stems (`data.manifest.stems.length`). */
	stemCount: () => number;
	/** The ready demos (`readyDemos.length`). */
	demoCount: () => number;
	/** The ready mixes (`readyMixes.length`). */
	mixCount: () => number;
	/** The stem player's engine, once it mounts. */
	engine: () => Pausable | null;
	/** The Demos view's panel, while it shows. */
	demoPanel: () => Pausable | null;
}

const PLAYER_MODE_KEY = "stemshovel.song.player-mode";

/**
 * The player (the stems or the demos, with their tabs) the same way (Kevin):
 * docked, floating from lg, or minimized to the action row's Player button,
 * the panel kept mounted so decoded stems and playback survive; the button
 * lights while it plays minimized. Remembered per browser.
 */
export class SongPlayerLayout {
	static readonly VIEWS: PlayerView[] = ["stems", "demos", "mixes"];
	mode = $state<PanelMode>("docked");
	/** The stem player's box as last shown; the demos box is at least that tall (560 is the empty box's minimum). */
	stemBoxHeight = $state(0);
	chosenView = $state<PlayerView | null>(null);
	#restore: Exclude<PanelMode, "minimised"> = "docked";
	#opts: SongPlayerLayoutOptions;
	// Until the visitor picks, the stage decides: mixing and finished open on the mixes, writing on the demos, arranging on the stems; a view with nothing in it gives way.
	#view = $derived.by<PlayerView>(() => {
		if (this.chosenView) return this.chosenView;
		const stage = this.#opts.stage();
		const wanted: PlayerView[] =
			stage === "mixing" || stage === "finished"
				? ["mixes", "stems", "demos"]
				: stage === "writing"
					? ["demos", "stems", "mixes"]
					: ["stems", "mixes", "demos"];
		const has = (v: PlayerView) =>
			v === "stems"
				? this.#opts.stemCount() > 0
				: v === "mixes"
					? this.#opts.mixCount() > 0
					: this.#opts.demoCount() > 0;
		return wanted.find(has) ?? "stems";
	});

	constructor(opts: SongPlayerLayoutOptions) {
		this.#opts = opts;
	}

	/** The view the box shows: the visitor's pick, else the stage's. */
	get view() {
		return this.#view;
	}

	/** One thing plays at a time: switching views pauses the others. */
	show(view: PlayerView) {
		this.chosenView = view;
		if (view !== "stems") this.#opts.engine()?.pause();
		if (view !== "demos") this.#opts.demoPanel()?.pause();
	}

	setMode(mode: PanelMode) {
		if (mode === "minimised" && this.mode !== "minimised") this.#restore = this.mode;
		this.mode = mode;
		try {
			localStorage.setItem(PLAYER_MODE_KEY, mode);
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}

	/** The action row's Player button: minimized, or back the way it was. */
	toggle() {
		this.setMode(this.mode === "minimised" ? this.#restore : "minimised");
	}

	/** The mode this browser remembers (the page's onMount). */
	load() {
		try {
			const pm = localStorage.getItem(PLAYER_MODE_KEY);
			if (pm === "docked" || pm === "floating" || pm === "minimised") this.mode = pm;
		} catch {
			// Private mode: docked.
		}
	}
}
