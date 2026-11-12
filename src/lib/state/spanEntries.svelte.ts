import type { SongChanges } from "#lib/state/songChanges.svelte.js";

/** A start of bar 1 and an end as saved, in seconds (null for none). */
export interface SavedSpan {
	startAt: number | null;
	endAt: number | null;
}

/** One of the two entries. */
export type SpanEntry = "startAtEntry" | "endAtEntry";

/**
 * A start of bar 1 and an end typed in the readout's format and carried as
 * seconds in a form's hidden fields: the song's settings form (SongDetails)
 * and an alternate arrangement's own (SongTempoKeyTab's "Start and end").
 * `positionValue` is what a hidden field holds, read as the entry is typed
 * (a remote field's `.as("hidden", value)` renders that value literally and
 * ignores `field.set`, and enhance captures the form's data before its
 * callback runs; FINDINGS.md), and `preparePositions` refuses a submit whose
 * entry is not a position.
 */
export class SpanEntries {
	/** Start of bar 1 as typed. */
	startAtEntry = $state("");
	/** The end as typed. */
	endAtEntry = $state("");
	positionError = $state<string | null>(null);
	#span: () => SavedSpan;
	#changes: () => SongChanges;

	/** `span` is the saved start and end, `changes` the position helpers (functions: both follow the page's data). */
	constructor(span: () => SavedSpan, changes: () => SongChanges) {
		this.#span = span;
		this.#changes = changes;
	}

	/** The saved start of bar 1 in the readout's format ("" when there is none). */
	get startAtText() {
		const at = this.#span().startAt;
		return at === null ? "" : this.#changes().editPos(at);
	}
	/** The saved end in the readout's format ("" when there is none). */
	get endAtText() {
		const at = this.#span().endAt;
		return at === null ? "" : this.#changes().editPos(at);
	}

	/** Either entry differs from what is saved. */
	get spanDirty() {
		return (
			this.startAtEntry.trim() !== this.startAtText || this.endAtEntry.trim() !== this.endAtText
		);
	}

	/** The entries as saved (the form opening, or after a save). */
	resetEntries() {
		this.positionError = null;
		this.startAtEntry = this.startAtText;
		this.endAtEntry = this.endAtText;
	}

	/** What an entry reads as: null when it is not a position, 0 when blank. */
	#seconds(entry: SpanEntry): number | null {
		const text = this[entry];
		if (!text.trim()) return 0;
		const span = this.#span();
		const start = entry === "startAtEntry";
		return this.#changes().rowSeconds({
			time: text,
			shown: start ? this.startAtText : this.endAtText,
			seconds: start ? span.startAt : span.endAt,
		});
	}

	/** The hidden field's value for an entry, as typed: the seconds, or "" for a blank or unreadable entry (preparePositions reports the latter). */
	positionValue = (entry: SpanEntry): string => {
		const seconds = this.#seconds(entry);
		return this[entry].trim() && seconds !== null ? String(seconds) : "";
	};

	/**
	 * Before a submit: false (with `positionError` set) when an entry does not
	 * read as a position; the hidden fields already hold the seconds (`positionValue`).
	 */
	preparePositions = () => {
		this.positionError = null;
		for (const [entry, label] of [
			["startAtEntry", "Start of bar 1"],
			["endAtEntry", "End"],
		] as const) {
			if (this.#seconds(entry) === null) {
				this.positionError = `${label}: ${this.#changes().positionMessage(this[entry])}`;
				return false;
			}
		}
		return true;
	};
}
