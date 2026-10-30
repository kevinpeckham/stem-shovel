import { tick } from "svelte";
import type MixList from "#lib/components/MixList.svelte";
import { MAX_MIXES_PER_SONG, MIX_FORMAT_LIST } from "#lib/constants/mixFormats.js";
import { STEM_MAX_BYTES } from "#lib/constants/stemFormats.js";
import { notify } from "#lib/state/notifications.svelte.js";
import { type MixReservation, postJson, uploadMixFile } from "#lib/upload.js";
import { demoContentType } from "#lib/utils/demoContentType.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { formatBytes } from "#lib/utils/formatBytes.js";

/** What the mix uploads read of the song (the page's data). */
export interface MixesSong {
	id: string;
	/** The song's mixes so far (only the count is read, for the room left). */
	mixes: readonly unknown[];
}

/** What the page supplies, as functions since SvelteKit reuses the page between songs. */
export interface MixUploadsOptions {
	song: () => MixesSong;
	/** After a batch with nothing uploaded: the page's data again (refreshAll). */
	onuploaded: () => Promise<void>;
	/** After a batch: the newest mix's own page (docs/mixes.md, "Phase 2"). */
	open: (mixId: string) => Promise<void>;
	/** The player shown on the Mixes view. */
	showMixes: () => void;
}

/** One file of a batch: its upload progress, decoding, or why it failed. */
interface MixJob {
	name: string;
	percent: number;
	error?: string;
	decoding?: boolean;
}

/** Why a pick is refused, checked in order: a format, a size, then the room left on the song. */
function refusalOf(picked: File[], room: number): string | null {
	const unsupported = picked.filter((f) => !demoContentType(f.name));
	if (unsupported.length)
		return `Not a supported format (${MIX_FORMAT_LIST}): ${unsupported.map((f) => f.name).join(", ")}`;
	const tooBig = picked.filter((f) => f.size > STEM_MAX_BYTES);
	if (tooBig.length)
		return `Over the ${formatBytes(STEM_MAX_BYTES)} limit: ${tooBig.map((f) => f.name).join(", ")}`;
	if (picked.length > room)
		return `Only ${room} more ${room === 1 ? "mix" : "mixes"} fit on this song (${MAX_MIXES_PER_SONG} max).`;
	return null;
}

/**
 * Mixes uploaded from the song page (the Mixes view's list and the Uploads
 * menu): checked for format, size and room, then uploaded one at a time
 * (decoded here for the waveform); the page then opens the newest. The
 * Mixes view's list binds onto `list`, for the Uploads menu's picker.
 */
export class MixUploads {
	/** The batch in flight, a row per file; cleared when every file went up. */
	jobs = $state<MixJob[]>([]);
	busy = $state(false);
	list: MixList | null = null;
	#ctx: AudioContext | null = null;
	#opts: MixUploadsOptions;

	constructor(opts: MixUploadsOptions) {
		this.#opts = opts;
	}

	/** Upload the picked mixes; a refusal is a notification and nothing goes up. */
	upload = async (picked: File[]) => {
		if (picked.length === 0 || this.busy) return;
		const song = this.#opts.song();
		const refusal = refusalOf(picked, Math.max(0, MAX_MIXES_PER_SONG - song.mixes.length));
		if (refusal) {
			notify(refusal, { kind: "error" });
			return;
		}
		this.busy = true;
		this.jobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		const last = await this.#send(picked, song.id);
		this.busy = false;
		if (this.jobs.every((j) => !j.error)) this.jobs = [];
		if (last) {
			notify(picked.length === 1 ? "Mix uploaded" : `${picked.length} mixes uploaded`);
			await this.#opts.open(last);
		} else await this.#opts.onuploaded();
	};

	/** The files one at a time, each job's progress and error on its row: the last mix that went up. */
	async #send(picked: File[], songId: string) {
		const ctx = (this.#ctx ??= new AudioContext());
		let last: string | null = null;
		for (const [i, file] of picked.entries()) {
			try {
				const { mixId } = await uploadMixFile(
					file,
					() =>
						postJson<MixReservation>("/api/mixes", {
							songId,
							filename: file.name,
							sizeBytes: file.size,
						}),
					{
						ctx,
						onProgress: (percent) => (this.jobs[i].percent = percent),
						onDecoding: () => (this.jobs[i].decoding = true),
					},
				);
				last = mixId;
			} catch (e) {
				this.jobs[i].error = errorMessage(e);
			}
		}
		return last;
	}

	/** The Uploads menu's Upload Mix: the player on the mixes, then the picker. */
	pick = async () => {
		this.#opts.showMixes();
		await tick();
		this.list?.pick();
	};
}
