import { DEMO_FORMAT_LIST, MAX_DEMOS_PER_SONG } from "#lib/constants/demoFormats.js";
import { STEM_MAX_BYTES } from "#lib/constants/stemFormats.js";
import { type DemoReservation, postJson, uploadDemoFile } from "#lib/upload.js";
import { demoContentType } from "#lib/utils/demoContentType.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { formatBytes } from "#lib/utils/formatBytes.js";

/** What the demo uploads read of the song (the page's data). */
export interface DemosSong {
	id: string;
	/** The song's demos so far (only the count is read, for the room left). */
	demos: readonly unknown[];
}

/** What the page supplies: the song and what to do once a batch has gone up. */
export interface DemoUploadsOptions {
	/** The song as saved (the page's data, so a function). */
	song: () => DemosSong;
	/** After a batch: the page's data again (refreshAll). */
	onuploaded: () => Promise<void>;
}

/** One file of a batch: its upload progress, or why it failed. */
interface DemoJob {
	name: string;
	percent: number;
	error?: string;
}

/** Why a pick is refused, checked in order: a format, a size, then the room left on the song. */
function refusalOf(picked: File[], room: number): string | null {
	const unsupported = picked.filter((f) => !demoContentType(f.name));
	if (unsupported.length)
		return `Not a supported format (${DEMO_FORMAT_LIST}): ${unsupported.map((f) => f.name).join(", ")}`;
	const tooBig = picked.filter((f) => f.size > STEM_MAX_BYTES);
	if (tooBig.length)
		return `Over the ${formatBytes(STEM_MAX_BYTES)} limit: ${tooBig.map((f) => f.name).join(", ")}`;
	if (picked.length > room)
		return `Only ${room} more ${room === 1 ? "demo" : "demos"} fit on this song (${MAX_DEMOS_PER_SONG} max).`;
	return null;
}

/**
 * Demo recordings uploaded from the song page (the settings' Demos tab, the
 * player's Demos view and the stem actions menu): no decoding, just the file,
 * checked for format, size and room first, then sent one at a time with its
 * progress. They are played and downloaded from the Demos view.
 */
export class DemoUploads {
	/** The batch in flight, a row per file; cleared when every file went up. */
	jobs = $state<DemoJob[]>([]);
	/** Why a pick was refused (format, size or room), shown until the next pick. */
	notice = $state<string | null>(null);
	busy = $state(false);
	#opts: DemoUploadsOptions;

	constructor(opts: DemoUploadsOptions) {
		this.#opts = opts;
	}

	/** Upload the files picked in a file input (the input is cleared for the next pick). */
	async upload(input: HTMLInputElement) {
		const picked = Array.from(input.files ?? []);
		input.value = "";
		if (picked.length === 0) return;
		const song = this.#opts.song();
		const refusal = refusalOf(picked, Math.max(0, MAX_DEMOS_PER_SONG - song.demos.length));
		if (refusal) {
			this.notice = refusal;
			return;
		}
		this.notice = null;
		this.busy = true;
		this.jobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		for (const [i, file] of picked.entries()) {
			try {
				await uploadDemoFile(
					file,
					() =>
						postJson<DemoReservation>("/api/demos", {
							songId: song.id,
							filename: file.name,
							sizeBytes: file.size,
						}),
					(percent) => (this.jobs[i].percent = percent),
				);
			} catch (e) {
				this.jobs[i].error = errorMessage(e);
			}
		}
		await this.#opts.onuploaded();
		this.busy = false;
		if (this.jobs.every((j) => !j.error)) this.jobs = [];
	}
}
