import { barSecondsAt, snapToAnchor, snapToDownbeat, type BarGrid } from "#lib/audio/measures.js";
import { detectSections, saveSections } from "#lib/remote/songs.remote.js";
import type { SectionsAnswer } from "#lib/server/aiDetect.js";
import { notify } from "#lib/state/notifications.svelte.js";
import type { SongChanges } from "#lib/state/songChanges.svelte.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { placedSections, type AlignedChart } from "#lib/utils/placedSections.js";
import { sectionsSourceWords } from "#lib/utils/sectionsSourceWords.js";
import { toRoman } from "#lib/utils/toRoman.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import type { SongSection } from "#lib/val/SongSectionSchema.js";

/** One row of the editor: the index and name, and the start as typed (and as first shown, with its exact seconds). */
interface SectionRow {
	index: string;
	name: string;
	time: string;
	shown: string;
	seconds: number | null;
}

/** What the page supplies: the song, the position helpers, the chart alignment and what to do after a save. */
export interface SongSectionsOptions {
	/** The song's id, its saved sections and its tempo, key and meter changes (the page's data, so a function). */
	song: () => { id: string; sections: SongSection[]; changes: SongChange[] };
	/** The song's bar grid, which detected starts snap to (null without a tempo and a time signature). */
	grid: () => BarGrid | null;
	/** The song has a chart the AI can read with the mix. */
	hasScore: () => boolean;
	/** The position helpers every editor shares (editPos, rowSeconds, positionMessage). */
	changes: SongChanges;
	/** The chart aligned to the stems (SongCheck's alignChart). */
	alignChart: () => Promise<AlignedChart>;
	/** After a save: the page's data again (refreshAll). */
	onsaved: () => Promise<void>;
}

/**
 * The song settings' Sections tab (SongSectionsTab.svelte): the rows of
 * index, name and start, filled from the song, edited and saved; "Detect"
 * (the listening model) and "Place from chart" (the chart aligned to the
 * stems), each saved at once when the song has no sections, else offered.
 */
export class SongSections {
	rows = $state<SectionRow[]>([]);
	error = $state<string | null>(null);
	saving = $state(false);
	busy = $state(false);
	answer = $state<SectionsAnswer | null>(null);
	/** Where the offered sections came from: the listening model, or the chart aligned to the stems. */
	source = $state<"ai" | "chart">("ai");
	#opts: SongSectionsOptions;

	constructor(opts: SongSectionsOptions) {
		this.#opts = opts;
	}

	/** How the tab names its offered answer ("the chart" / "placed", or the AI's). */
	get words() {
		return sectionsSourceWords(this.source, this.#opts.hasScore());
	}

	/** The rows as the song has them. */
	reset = () => {
		const { changes } = this.#opts;
		this.rows = this.#opts.song().sections.map((s) => ({
			index: s.index ?? "",
			name: s.name,
			time: changes.editPos(s.start),
			shown: changes.editPos(s.start),
			seconds: s.start,
		}));
	};

	/** "Add row": the next roman numeral, starting at the top. */
	add = () => {
		this.rows = [
			...this.rows,
			{
				index: toRoman(this.rows.length + 1),
				name: "",
				time: this.#opts.changes.editPos(0),
				shown: "",
				seconds: null,
			},
		];
	};

	remove = (i: number) => {
		this.rows = this.rows.filter((_, j) => j !== i);
	};

	async #persist(next: SongSection[]) {
		this.error = null;
		this.saving = true;
		try {
			await saveSections({ id: this.#opts.song().id, sections: next });
			await this.#opts.onsaved();
			this.reset();
			notify("Sections saved");
		} catch (e) {
			this.error = errorMessage(e);
		} finally {
			this.saving = false;
		}
	}

	// "Detect": the listening model splits the mix into sections, with the song's score when it has one
	// (docs/audio-engine.md, "Detect sections"); saved at once when the song has none, else offered.
	detect = async () => {
		this.busy = true;
		this.source = "ai";
		this.answer = null;
		this.error = null;
		try {
			const answer = await detectSections({ id: this.#opts.song().id });
			if (answer.sections.length === 0) {
				notify("The AI could not tell the sections apart", { kind: "info" });
				return;
			}
			if (this.#opts.song().sections.length === 0) {
				this.answer = answer;
				await this.useAnswer();
			} else this.answer = answer;
		} catch (e) {
			const status = (e as { status?: unknown }).status;
			this.error =
				status === 409 ? "The mix is still rendering; try again in a moment" : errorMessage(e);
		} finally {
			this.busy = false;
		}
	};

	/** "Use these": the offered sections become the song's, after a confirm when it has some. */
	useAnswer = async () => {
		const offered = this.answer;
		if (!offered) return;
		const song = this.#opts.song();
		if (
			song.sections.length > 0 &&
			!confirm(`Replace the song's sections with the ${this.words.ones} ones?`)
		)
			return;
		// Each start to the bar line it was heard near, and onto a key change within a bar of it (docs/audio-engine.md, "Snapped to the bar").
		const grid = this.#opts.grid();
		const keyStarts = song.changes.filter((c) => c.kind === "key").map((c) => c.start);
		const snap = (at: number) => {
			if (!grid) return at;
			const bar = snapToDownbeat(grid, at);
			return snapToAnchor(bar, keyStarts, barSecondsAt(grid, bar));
		};
		const sections = offered.sections.map((s, i) => ({
			index: toRoman(i + 1),
			name: s.name,
			start: Math.round(snap(s.at) * 10) / 10,
		}));
		await this.#persist(sections);
		if (!this.error) {
			this.answer = null;
			notify(`${sections.length} sections set from ${this.words.from}`, { timeout: 8000 });
		}
	};

	// "Place from chart": the chart's own sections where the alignment puts them; saved at once
	// when the song has none, else offered (as "Detect" does).
	placeFromChart = async () => {
		this.busy = true;
		this.source = "chart";
		this.answer = null;
		this.error = null;
		try {
			const placed = placedSections(await this.#opts.alignChart());
			if (typeof placed === "string") {
				notify(placed, { kind: "info" });
				return;
			}
			this.answer = placed;
			if (this.#opts.song().sections.length === 0) await this.useAnswer();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			this.busy = false;
		}
	};

	/** "Save sections": every row's start checked, then saved; the first bad row's message otherwise. */
	save = async () => {
		const parsed: SongSection[] = [];
		const { changes } = this.#opts;
		for (const row of this.rows) {
			const start = changes.rowSeconds(row);
			if (start === null) {
				this.error = changes.positionMessage(row.time);
				return;
			}
			parsed.push({ index: row.index, name: row.name, start });
		}
		await this.#persist(parsed);
	};
}
