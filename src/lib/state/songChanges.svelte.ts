import { formatPosition, parsePosition, type BarGrid } from "#lib/audio/measures.js";
import { readoutMode } from "#lib/audio/readout.svelte.js";
import { SONG_CHANGE_LABELS, type SongChangeKind } from "#lib/constants/songChanges.js";
import { saveChanges } from "#lib/remote/songs.remote.js";
import { notify } from "#lib/state/notifications.svelte.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { parseBarsText } from "#lib/utils/parseBarsText.js";
import { songChangeValueError } from "#lib/utils/songChangeValueError.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";

/** An empty position field's hint, per readout mode. */
export const POSITION_PLACEHOLDER = {
	time: "0:00.0",
	timecode: "00:00:00.00",
	bars: "1|1",
} as const;

/** One row of the editor: the time as typed (and as first shown, with its exact seconds), the kind and the value. */
interface ChangeRow {
	time: string;
	shown: string;
	seconds: number | null;
	kind: SongChangeKind;
	value: string;
}

/** What the page supplies: the song, the position context and what to do after a save. */
export interface SongChangesOptions {
	/** The song's id and its saved changes (the page's data, so a function). */
	song: () => { id: string; changes: SongChange[] };
	/** The frame rate and the bar grid positions read and are typed against. */
	posCtx: () => { fps: number; grid: BarGrid | null };
	/** After a save: the page's data again (refreshAll). */
	onsaved: () => Promise<void>;
}

/**
 * The song settings' tempo, key and time signature rows (SongTempoKeyTab.svelte):
 * rows of time, kind and value, filled from the song, edited, checked and
 * saved; and the position helpers the page's other editors share (positions
 * read and are typed in the readout's format: time, timecode or bars).
 */
export class SongChanges {
	rows = $state<ChangeRow[]>([]);
	error = $state<string | null>(null);
	saving = $state(false);
	#opts: SongChangesOptions;

	constructor(opts: SongChangesOptions) {
		this.#opts = opts;
	}

	/** The position format in use (the readout's). */
	get mode() {
		return readoutMode(!!this.#opts.posCtx().grid);
	}

	// Editors show full precision (milliseconds, beat fractions) so a row that
	// is saved unedited keeps its exact seconds; see rowSeconds.
	editPos = (seconds: number): string =>
		formatPosition(this.mode, seconds, this.#opts.posCtx(), { precise: true });

	/** The exact stored seconds when the text was not touched, else what the text says (null = not a position). */
	rowSeconds = (row: { time: string; shown: string; seconds: number | null }): number | null =>
		row.seconds !== null && row.time.trim() === row.shown
			? row.seconds
			: parsePosition(row.time, this.#opts.posCtx());

	/** Why `text` did not parse: bars typed on a song without a tempo and meter get their own message. */
	positionMessage = (text: string): string =>
		parseBarsText(text) && !this.#opts.posCtx().grid
			? `"${text}" is in bars, but bars need a tempo and a time signature — add both under "Tempo, key and time signature" first, or enter the position as time (1:23.4) or timecode (01:23:15.72).`
			: `"${text}" is not a position (time 1:23.4, timecode 01:23:15.72, or bars 12|3).`;

	/** The rows as the song has them. */
	reset = () => {
		this.rows = this.#opts.song().changes.map((c) => ({
			time: this.editPos(c.start),
			shown: this.editPos(c.start),
			seconds: c.start,
			kind: c.kind,
			value: c.value,
		}));
	};

	/** "Add change": a tempo row, at the start when it is the first. */
	add = () => {
		this.rows = [
			...this.rows,
			{
				time: this.rows.length ? "" : this.editPos(0),
				shown: "",
				seconds: null,
				kind: "tempo",
				value: "",
			},
		];
	};

	remove = (i: number) => {
		this.rows = this.rows.filter((_, j) => j !== i);
	};

	/** Check every row and save them as the song's changes; the first bad row's message otherwise. */
	save = async () => {
		this.error = null;
		const parsed: SongChange[] = [];
		for (const row of this.rows) {
			const start = this.rowSeconds(row);
			if (start === null) {
				this.error = this.positionMessage(row.time);
				return;
			}
			const bad = songChangeValueError(row.kind, row.value);
			if (bad) {
				this.error = `${SONG_CHANGE_LABELS[row.kind]} at ${row.time}: ${bad}`;
				return;
			}
			parsed.push({ kind: row.kind, start, value: row.value.trim() });
		}
		this.saving = true;
		try {
			await saveChanges({ id: this.#opts.song().id, changes: parsed });
			await this.#opts.onsaved();
			this.reset();
			notify("Tempo, key and time signature saved");
		} catch (e) {
			this.error = errorMessage(e);
		} finally {
			this.saving = false;
		}
	};
}
