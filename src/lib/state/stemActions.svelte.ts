import type { StemTint } from "#lib/constants/stemTints.js";
import { MIDI_MAX_BYTES } from "#lib/constants/midiFormats.js";
import { renameStem, reorderStems, setSongVersion, setStemTint } from "#lib/remote/songs.remote.js";
import { notify } from "#lib/state/notifications.svelte.js";
import { postJson, type Reservation, uploadMidiFile, uploadStemFile } from "#lib/upload.js";
import { bumpVersion } from "#lib/utils/bumpVersion.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { midiContentType } from "#lib/utils/midiContentType.js";

/** What the stem actions read of the song (the page's data). */
export interface StemActionsSong {
	id: string;
	version: string;
}

/** What the page supplies: the song and what to do once something is saved. */
export interface StemActionsOptions {
	/** The song as saved (the page's data, so a function). */
	song: () => StemActionsSong;
	/** After a save: the page's data again (refreshAll). */
	onsaved: () => Promise<void>;
}

/** A stem's new file on its way: the upload's percent, then decoding, or why it failed. */
interface ReplaceJob {
	percent: number;
	stage: string;
	error?: string;
}

/** A stem's MIDI file on its way, or why it was refused or failed. */
interface MidiJob {
	percent: number;
	error?: string;
}

type BumpLevel = "major" | "minor" | "patch";

/**
 * What a member does to one stem from its row menu (docs/song-page.md, step 7):
 * a new version of its file, its MIDI file, its name and tint; the order of the
 * rows; and, after stems change, the offer to bump the song's version (the user
 * decides, nothing bumps itself).
 */
export class StemActions {
	/** "Upload new version" in flight, by stem id. */
	replacing = $state<Record<string, ReplaceJob>>({});
	/** A MIDI upload in flight or refused, by stem id. */
	midiJobs = $state<Record<string, MidiJob>>({});
	/** Stems changed: the banner offers a version bump. */
	versionOffer = $state(false);
	versionBusy = $state(false);
	#opts: StemActionsOptions;

	constructor(opts: StemActionsOptions) {
		this.#opts = opts;
	}

	/** Stems changed (a replace here, or the uploader's callback): offer the bump. */
	offer = () => {
		this.versionOffer = true;
	};

	/** "Keep v…": no bump this time. */
	dismiss = () => {
		this.versionOffer = false;
	};

	/** Bump the song's version by one level, then drop the offer either way. */
	bump = async (level: BumpLevel) => {
		this.versionBusy = true;
		try {
			const song = this.#opts.song();
			const next = bumpVersion(song.version, level);
			await setSongVersion({ id: song.id, version: next });
			await this.#opts.onsaved();
			notify(`Version bumped to v${next}`);
		} finally {
			this.versionBusy = false;
			this.versionOffer = false;
		}
	};

	/**
	 * "Upload new version" for one stem: same pipeline as adding, but the
	 * reservation is /api/stems/[id]/replace, which keeps the row and label.
	 */
	replace = async (stemId: string, input: HTMLInputElement) => {
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		const ctx = new AudioContext({ sampleRate: 32_000 });
		this.replacing[stemId] = { percent: 0, stage: "uploading" };
		try {
			await uploadStemFile(
				file,
				() =>
					postJson<Reservation>(`/api/stems/${stemId}/replace`, {
						filename: file.name,
						sizeBytes: file.size,
					}),
				{
					ctx,
					onProgress: (p) => (this.replacing[stemId] = { ...this.replacing[stemId], percent: p }),
					onDecoding: () =>
						(this.replacing[stemId] = { ...this.replacing[stemId], stage: "decoding" }),
				},
			);
			delete this.replacing[stemId];
			await this.#opts.onsaved();
			this.versionOffer = true;
		} catch (err) {
			this.replacing[stemId] = {
				...this.replacing[stemId],
				stage: "error",
				error: (err as Error).message,
			};
		} finally {
			await ctx.close();
		}
	};

	/** The row's tint from the menu: saved on the song, the player retints in place on the refresh. */
	tint = async (stemId: string, tint: StemTint | null) => {
		try {
			await setStemTint({ id: stemId, tint });
			await this.#opts.onsaved();
		} catch (e) {
			notify(`Could not set the tint: ${errorMessage(e)}`, { kind: "error" });
		}
	};

	/**
	 * Rename from the row menu. A prompt keeps this one-click; the load refresh
	 * carries the new label into the player without re-decoding (StemPlayer
	 * relabels in place).
	 */
	rename = async (stemId: string, current: string) => {
		const label = prompt("Stem name", current)?.trim();
		if (!label || label === current) return;
		await renameStem({ id: stemId, label });
		await this.#opts.onsaved();
	};

	/** A stem's optional MIDI file: uploaded from the row menu; a badge on the row when present. */
	uploadMidi = async (stemId: string, input: HTMLInputElement) => {
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		if (!midiContentType(file.name)) {
			this.midiJobs = {
				...this.midiJobs,
				[stemId]: { percent: 0, error: `${file.name} is not a MIDI file (.mid or .midi).` },
			};
			return;
		}
		if (file.size > MIDI_MAX_BYTES) {
			this.midiJobs[stemId] = {
				percent: 0,
				error: `${file.name} is over ${formatBytes(MIDI_MAX_BYTES)}.`,
			};
			return;
		}
		this.midiJobs = { ...this.midiJobs, [stemId]: { percent: 0 } };
		try {
			await uploadMidiFile(
				stemId,
				file,
				(percent) => (this.midiJobs = { ...this.midiJobs, [stemId]: { percent } }),
			);
			await this.#opts.onsaved();
			// Reassign rather than delete: a removed key does not notify the row.
			this.midiJobs = Object.fromEntries(
				Object.entries(this.midiJobs).filter(([id]) => id !== stemId),
			);
		} catch (e) {
			this.midiJobs = {
				...this.midiJobs,
				[stemId]: { percent: 0, error: errorMessage(e) },
			};
		}
	};

	/** A member dragged the rows into a new order: it becomes the song's order, for everyone. */
	saveOrder = async (ids: string[]) => {
		try {
			await reorderStems({ songId: this.#opts.song().id, ids });
			await this.#opts.onsaved();
			notify("Stem order saved");
		} catch (e) {
			notify(`Could not save the stem order: ${errorMessage(e)}`, { kind: "error" });
		}
	};
}
