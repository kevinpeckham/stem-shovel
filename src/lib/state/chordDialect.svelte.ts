import type { ComponentProps } from "svelte";
import type ContextMenu from "#lib/components/ContextMenu.svelte";

/** How the Chords view spells chords: names, or each chord's degree in its bar's key (barmark's numerals). */
export type ChordDialect = "names" | "nashville" | "roman";
const CHORD_DIALECTS: { id: ChordDialect; label: string; short: string }[] = [
	{ id: "names", label: "Chord names", short: "Names" },
	{ id: "nashville", label: "Nashville numbers", short: "Nashville" },
	{ id: "roman", label: "Roman numerals", short: "Roman" },
];
type MenuItems = NonNullable<ComponentProps<typeof ContextMenu>["items"]>;

/** One key for every chart that offers the menu: the song page and the home page's demo share the choice. */
const CHORD_DIALECT_KEY = "stemshovel.song.chord-dialect";

/**
 * The chord spelling menu's state: names, Nashville numbers or Roman
 * numerals, this browser's choice. `load()` reads it once mounted.
 */
export class ChordDialectChoice {
	/** The Chords view's spelling. */
	dialect = $state<ChordDialect>("names");

	/** The renderer's `numerals` for the chosen spelling, null for chord names. */
	get numerals(): "nashville" | "roman" | null {
		return this.dialect === "names" ? null : this.dialect;
	}
	/** The chord spelling menu's trigger: the current spelling, short. */
	get short() {
		return CHORD_DIALECTS.find((d) => d.id === this.dialect)?.short ?? "Names";
	}
	/** The chord spelling menu: the three spellings, the current one checked. */
	get items(): MenuItems {
		return CHORD_DIALECTS.map((d) => ({
			id: d.id,
			label: d.label,
			iconClass: d.id === this.dialect ? "i-ph-check" : "i-ph-check invisible",
			action: () => this.set(d.id),
		}));
	}

	/** The view redraws in place (under an open editor too), so nothing closes. */
	set(dialect: ChordDialect) {
		this.dialect = dialect;
		try {
			localStorage.setItem(CHORD_DIALECT_KEY, dialect);
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}

	/** Read this browser's choice (from onMount). */
	load() {
		try {
			const stored = CHORD_DIALECTS.find((d) => d.id === localStorage.getItem(CHORD_DIALECT_KEY));
			if (stored) this.dialect = stored.id;
		} catch {
			// Private mode: chord names.
		}
	}
}
