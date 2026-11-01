import { addSongCredit, removeSongCredit, updateSong } from "#lib/remote/songs.remote.js";
import { notify } from "#lib/state/notifications.svelte.js";
import type { SongChanges } from "#lib/state/songChanges.svelte.js";
import { clearForm } from "#lib/utils/clearForm.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import type { CreditRole } from "#lib/val/CreditRoleSchema.js";

/** What the Details tab reads of the song (the page's data). */
export interface DetailsSong {
	id: string;
	title: string;
	slug: string;
	description: string;
	writtenOn: string | null;
	version: string;
	frameRate: number;
	startAt: number | null;
	endAt: number | null;
}

/** What the page supplies: the song, the position helpers and what to do after a credit changes. */
export interface SongDetailsOptions {
	/** The song as saved (the page's data, so a function). */
	song: () => DetailsSong;
	/** The position helpers every editor shares (editPos, rowSeconds, positionMessage). */
	changes: SongChanges;
	/** After a credit is added or removed: the page's data again (refreshAll). */
	onsaved: () => Promise<void>;
}

/**
 * The song settings' Details tab (SongDetailsTab.svelte): the settings form
 * on the `updateSong` remote form (title, URL, description, first written,
 * start and end, version, frame rate), read back through its fields, and the
 * credits, added and removed as you go. Start and end are typed in the
 * readout's format and carried as seconds: `positionValue` is what the
 * form's hidden field holds, read as the entry is typed (a remote field's
 * `.as("hidden", value)` renders that value literally and ignores
 * `field.set`, and enhance captures the form's data before its callback
 * runs; FINDINGS.md), and `preparePositions` refuses a submit whose entry
 * is not a position.
 */
export class SongDetails {
	/** Start of bar 1 as typed. */
	startAtEntry = $state("");
	/** The end as typed. */
	endAtEntry = $state("");
	positionError = $state<string | null>(null);
	/** A name per role, added on Enter or with the button. */
	creditDraft = $state<Record<CreditRole, string>>({ performer: "", composer: "", producer: "" });
	creditBusy = $state(false);
	#opts: SongDetailsOptions;

	constructor(opts: SongDetailsOptions) {
		this.#opts = opts;
	}

	/** The settings form's fields (a module singleton, so the page and the tab share it). */
	get fields() {
		return updateSong.fields;
	}

	get title() {
		return this.fields.title.value() ?? this.#opts.song().title;
	}
	get slug() {
		return this.fields.slug.value() ?? this.#opts.song().slug;
	}
	get description() {
		return this.fields.description.value() ?? this.#opts.song().description;
	}
	get writtenOn() {
		return this.fields.writtenOn.value() ?? this.#opts.song().writtenOn ?? "";
	}
	get version() {
		return this.fields.version.value() ?? this.#opts.song().version;
	}
	get frameRate() {
		return this.fields.frameRate.value() ?? String(this.#opts.song().frameRate);
	}

	/** The saved start of bar 1 in the readout's format ("" when there is none). */
	get startAtText() {
		const at = this.#opts.song().startAt;
		return at === null ? "" : this.#opts.changes.editPos(at);
	}
	/** The saved end in the readout's format ("" when there is none). */
	get endAtText() {
		const at = this.#opts.song().endAt;
		return at === null ? "" : this.#opts.changes.editPos(at);
	}

	/** Anything differs from the song as saved (Save is enabled). */
	get settingsDirty() {
		const song = this.#opts.song();
		return (
			this.title.trim() !== song.title ||
			this.slug.trim() !== song.slug ||
			this.description.trim() !== song.description ||
			this.writtenOn !== (song.writtenOn ?? "") ||
			this.startAtEntry.trim() !== this.startAtText ||
			this.endAtEntry.trim() !== this.endAtText ||
			this.frameRate !== String(song.frameRate) ||
			this.version.trim() !== song.version
		);
	}

	/** The `<form>` element (SongDetailsTab binds it): reset natively with the store, so fields someone typed in come back as the song has them (clearForm). */
	form: HTMLFormElement | null = null;

	/** The form as the song has it: the saved values, not the last edit (the popover opening). */
	reset = () => {
		clearForm(updateSong, this.form);
		this.positionError = null;
		this.startAtEntry = this.startAtText;
		this.endAtEntry = this.endAtText;
	};

	/** What an entry reads as: null when it is not a position, 0 when blank. */
	#seconds(entry: "startAtEntry" | "endAtEntry"): number | null {
		const text = this[entry];
		if (!text.trim()) return 0;
		const song = this.#opts.song();
		const start = entry === "startAtEntry";
		return this.#opts.changes.rowSeconds({
			time: text,
			shown: start ? this.startAtText : this.endAtText,
			seconds: start ? song.startAt : song.endAt,
		});
	}

	/** The hidden field's value for an entry, as typed: the seconds, or "" for a blank or unreadable entry (preparePositions reports the latter). */
	positionValue = (entry: "startAtEntry" | "endAtEntry"): string => {
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
				this.positionError = `${label}: ${this.#opts.changes.positionMessage(this[entry])}`;
				return false;
			}
		}
		return true;
	};

	addCredit = async (role: CreditRole) => {
		const name = this.creditDraft[role].trim();
		if (!name || this.creditBusy) return;
		this.creditBusy = true;
		try {
			await addSongCredit({ songId: this.#opts.song().id, role, name });
			this.creditDraft[role] = "";
			await this.#opts.onsaved();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			this.creditBusy = false;
		}
	};

	removeCredit = async (id: string) => {
		if (this.creditBusy) return;
		this.creditBusy = true;
		try {
			await removeSongCredit({ id });
			await this.#opts.onsaved();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			this.creditBusy = false;
		}
	};
}
