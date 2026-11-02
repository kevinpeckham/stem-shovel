import type { ComponentProps } from "svelte";
import { parseChart, transposeChart } from "barmark";
import type ContextMenu from "#lib/components/ContextMenu.svelte";
import { tonicPitchClass } from "#lib/utils/tonicPitchClass.js";

type MenuItems = NonNullable<ComponentProps<typeof ContextMenu>["items"]>;
type ChartKey = { tonic: string; mode: string };

/** One remembered key per song: a viewing choice, so per browser. */
const CHART_KEY_PREFIX = "stemshovel.song.chart-key.";
/** The fixed spelling of a moved key, by pitch class. */
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** −5..+6: every key once, the shorter way round. */
function normalize(n: number): number {
	const pc = ((Math.round(n) % 12) + 12) % 12;
	return pc > 6 ? pc - 12 : pc;
}

/**
 * The Chords view's key: the chart drawn transposed by `semitones` (−5..+6,
 * 0 the original), a viewing choice like the chord spelling, remembered per
 * song in this browser. The chart text itself never changes. `load()` reads
 * the choice once mounted.
 */
export class ChartKeyChoice {
	/** Semitones from the chart's own key, −5..+6. */
	semitones = $state(0);
	#songId: string;
	/** The last chart parsed and its first key, so a menu render parses once. */
	#parsed: { markdown: string; key: ChartKey | null } | null = null;

	constructor(songId: string) {
		this.#songId = songId;
	}

	get #storageKey() {
		return CHART_KEY_PREFIX + this.#songId;
	}

	#key(markdown: string): ChartKey | null {
		if (this.#parsed?.markdown !== markdown) {
			const key = parseChart(markdown).bars[0]?.key ?? null;
			this.#parsed = { markdown, key: key && tonicPitchClass(key.tonic) !== null ? key : null };
		}
		return this.#parsed.key;
	}

	/** The key name `semitones` away from the chart's key, in the fixed spelling (the original's own at 0). */
	#keyName(key: ChartKey, semitones: number): string {
		const suffix = key.mode === "minor" ? "m" : "";
		if (semitones === 0) return key.tonic + suffix;
		return KEY_NAMES[((tonicPitchClass(key.tonic) ?? 0) + semitones + 12) % 12] + suffix;
	}

	/** Draw the chart `n` semitones away (normalized to −5..+6) and remember it. */
	set(n: number) {
		this.semitones = normalize(n);
		try {
			localStorage.setItem(this.#storageKey, String(this.semitones));
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}

	/** Read this browser's choice for the song (from onMount). */
	load() {
		try {
			const stored = localStorage.getItem(this.#storageKey);
			const n = stored === null ? NaN : Number(stored);
			if (Number.isInteger(n) && n >= -5 && n <= 6) this.semitones = n;
		} catch {
			// Private mode: the original key.
		}
	}

	/** The chart text to draw: the markdown itself in the original key, else barmark's transposition. */
	text(markdown: string): string {
		if (this.semitones === 0) return markdown;
		return transposeChart(markdown, { semitones: this.semitones }).text;
	}

	/** The Key menu's trigger: the key the chart is shown in, or the distance when the chart names no key. */
	label(markdown: string): string {
		const key = this.#key(markdown);
		if (key) return this.#keyName(key, this.semitones);
		if (this.semitones === 0) return "Original";
		return this.semitones > 0 ? `+${this.semitones}` : `−${-this.semitones}`;
	}

	/** The Key menu: the twelve keys from the chart's own, or the distances when it names none; the current one checked. */
	items(markdown: string): MenuItems {
		const key = this.#key(markdown);
		const check = (n: number) => (n === this.semitones ? "i-ph-check" : "i-ph-check invisible");
		if (key) {
			return Array.from({ length: 12 }, (_, i) => {
				const n = normalize(i);
				return {
					id: `key-${i}`,
					label: i === 0 ? `${this.#keyName(key, 0)} (original)` : this.#keyName(key, i),
					iconClass: check(n),
					action: () => this.set(n),
				};
			});
		}
		const steps = [0, 1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5];
		return steps.map((n) => ({
			id: `key-${n}`,
			label: n === 0 ? "Original" : n > 0 ? `Up ${n}` : `Down ${-n}`,
			iconClass: check(n),
			action: () => this.set(n),
		}));
	}
}
